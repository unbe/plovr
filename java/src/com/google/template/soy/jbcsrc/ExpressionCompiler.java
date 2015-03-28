/*
 * Copyright 2015 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.google.template.soy.jbcsrc;

import static com.google.common.base.Preconditions.checkNotNull;
import static com.google.template.soy.jbcsrc.BytecodeUtils.compare;
import static com.google.template.soy.jbcsrc.BytecodeUtils.logicalNot;

import com.google.common.primitives.Ints;
import com.google.template.soy.exprtree.AbstractReturningExprNodeVisitor;
import com.google.template.soy.exprtree.BooleanNode;
import com.google.template.soy.exprtree.ExprNode;
import com.google.template.soy.exprtree.ExprRootNode;
import com.google.template.soy.exprtree.FieldAccessNode;
import com.google.template.soy.exprtree.FloatNode;
import com.google.template.soy.exprtree.FunctionNode;
import com.google.template.soy.exprtree.IntegerNode;
import com.google.template.soy.exprtree.ItemAccessNode;
import com.google.template.soy.exprtree.ListLiteralNode;
import com.google.template.soy.exprtree.MapLiteralNode;
import com.google.template.soy.exprtree.NullNode;
import com.google.template.soy.exprtree.OperatorNodes.AndOpNode;
import com.google.template.soy.exprtree.OperatorNodes.ConditionalOpNode;
import com.google.template.soy.exprtree.OperatorNodes.DivideByOpNode;
import com.google.template.soy.exprtree.OperatorNodes.EqualOpNode;
import com.google.template.soy.exprtree.OperatorNodes.GreaterThanOpNode;
import com.google.template.soy.exprtree.OperatorNodes.GreaterThanOrEqualOpNode;
import com.google.template.soy.exprtree.OperatorNodes.LessThanOpNode;
import com.google.template.soy.exprtree.OperatorNodes.LessThanOrEqualOpNode;
import com.google.template.soy.exprtree.OperatorNodes.MinusOpNode;
import com.google.template.soy.exprtree.OperatorNodes.ModOpNode;
import com.google.template.soy.exprtree.OperatorNodes.NegativeOpNode;
import com.google.template.soy.exprtree.OperatorNodes.NotEqualOpNode;
import com.google.template.soy.exprtree.OperatorNodes.NotOpNode;
import com.google.template.soy.exprtree.OperatorNodes.OrOpNode;
import com.google.template.soy.exprtree.OperatorNodes.PlusOpNode;
import com.google.template.soy.exprtree.OperatorNodes.TimesOpNode;
import com.google.template.soy.exprtree.StringNode;
import com.google.template.soy.exprtree.VarRefNode;
import com.google.template.soy.jbcsrc.SoyExpression.BoolExpression;
import com.google.template.soy.jbcsrc.SoyExpression.BoxedExpression;
import com.google.template.soy.jbcsrc.SoyExpression.FloatExpression;
import com.google.template.soy.jbcsrc.SoyExpression.IntExpression;
import com.google.template.soy.jbcsrc.SoyExpression.ListExpression;
import com.google.template.soy.jbcsrc.SoyExpression.MapExpression;
import com.google.template.soy.jbcsrc.SoyExpression.StringExpression;

import org.objectweb.asm.Label;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.commons.GeneratorAdapter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Compiles a {@link ExprNode} to a {@link SoyExpression}.
 *
 * <p>This is an abstract class that supports all expressions except var refs, data access and
 * function calls.
 */
abstract class ExpressionCompiler extends AbstractReturningExprNodeVisitor<SoyExpression> {

  /**
   * Compiles the given expression tree to a sequence of bytecode in the current method visitor.
   *
   * <p>The generated bytecode expects that the evaluation stack is empty when this method is
   * called and it will generate code such that the stack contains a single SoyValue when it
   * returns.  The SoyValue object will have a runtime type equal to
   * {@code node.getType().javaType()}.
   */
  SoyExpression compile(ExprNode node) {
    return visit(checkNotNull(node));
  }

  @Override protected final SoyExpression visitExprRootNode(ExprRootNode<?> node) {
    return visit(node.getChild(0));
  }

  // Primitive value constants

  @Override protected final SoyExpression visitNullNode(NullNode node) {
    return SoyExpression.NULL;
  }

  @Override protected final SoyExpression visitFloatNode(FloatNode node) {
    return BytecodeUtils.constant(node.getValue());
  }

  @Override protected final SoyExpression visitStringNode(StringNode node) {
    return BytecodeUtils.constant(node.getValue());
  }

  @Override protected final SoyExpression visitBooleanNode(BooleanNode node) {
    return node.getValue() ? BoolExpression.TRUE : BoolExpression.FALSE;
  }

  @Override protected final SoyExpression visitIntegerNode(IntegerNode node) {
    return BytecodeUtils.constant((long) node.getValue());
  }

  // Collection literals

  @Override protected final SoyExpression visitListLiteralNode(ListLiteralNode node) {
    // First we construct an ArrayList of the appropriate size
    final int numChildren = node.getChildren().size();
    if (numChildren == 0) {
      return new ListExpression() {
        final Expression immutableListOf = MethodRef.IMMUTABLE_LIST_OF.invoke();
        @Override void doGen(GeneratorAdapter adapter) {
          immutableListOf.gen(adapter);
        }

        @Override boolean isConstant() {
          return true;
        }
      };
    }
    List<Statement> adds = new ArrayList<>(numChildren);
    // Now evaluate each child, which should result in the value being at the top of the stack
    // and then add it to the list.
    Expression dupExpr = BytecodeUtils.dupExpr(Type.getType(ArrayList.class));
    boolean localIsConstant = true;
    for (ExprNode child : node.getChildren()) {
      // All children must be soy values
      SoyExpression childExpr = visit(child).box();
      localIsConstant = localIsConstant && childExpr.isConstant();
      adds.add(MethodRef.ARRAY_LIST_ADD.invoke(dupExpr, childExpr).toStatement());
    }
    final boolean isConstant = localIsConstant;
    final Expression construct = ConstructorRef.ARRAY_LIST_SIZE
        .construct(BytecodeUtils.constant(numChildren));
    final Statement addAll = Statement.concat(adds);
    return new ListExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        construct.gen(mv);
        addAll.gen(mv);
      }

      @Override boolean isConstant() {
        return isConstant;
      }
    };
  }

  @Override protected final SoyExpression visitMapLiteralNode(MapLiteralNode node) {
    final int numItems = node.numChildren() / 2;
    if (numItems == 0) {
      return new MapExpression() {
        final Expression immutableMapOf = MethodRef.IMMUTABLE_MAP_OF.invoke();
        @Override void doGen(GeneratorAdapter adapter) {
          immutableMapOf.gen(adapter);
        }

        @Override boolean isConstant() {
          return true;
        }
      };
    }
    final int hashMapCapacity = hashMapCapacity(numItems);
    Expression dupExpr = BytecodeUtils.dupExpr(Type.getType(LinkedHashMap.class));
    List<Statement> puts = new ArrayList<>(numItems);
    boolean localIsConstant = true;
    for (int i = 0; i < numItems; i++) {
      // Keys are strings and values are boxed SoyValues
      SoyExpression key = visit(node.getChild(2 * i)).convert(String.class);
      SoyExpression value = visit(node.getChild(2 * i + 1)).box();
      localIsConstant = localIsConstant && key.isConstant() && value.isConstant();
      // TODO(user): Assert that the return value of put() is null? The current impl doesn't
      // care, but perhaps we should
      puts.add(MethodRef.LINKED_HASH_MAP_PUT.invoke(dupExpr, key, value).toStatement());
    }
    final boolean isConstant = localIsConstant;
    final Expression construct = ConstructorRef.LINKED_HASH_MAP_SIZE
        .construct(BytecodeUtils.constant(hashMapCapacity));
    final Statement putAll = Statement.concat(puts);
    return new MapExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        // create a linkedhashmap with the expected size.
        construct.gen(mv);
        // call put for each key value pair.
        putAll.gen(mv);
      }

      @Override boolean isConstant() {
        return isConstant;
      }
    };
  }

  // Comparison operators.

  @Override protected final SoyExpression visitEqualOpNode(EqualOpNode node) {
    return doEquals(visit(node.getChild(0)), visit(node.getChild(1)));
  }

  @Override protected final SoyExpression visitNotEqualOpNode(NotEqualOpNode node) {
    return logicalNot(doEquals(visit(node.getChild(0)), visit(node.getChild(1))));
  }

  private BoolExpression doEquals(final SoyExpression left, final SoyExpression right) {
    // We can special case when we know the types.
    // If either is a string, we run special logic so test for that first
    // otherwise we special case primitives and eventually fall back to our runtime.
    if (left.isKnownString()) {
      return doEqualsString((StringExpression) left.convert(String.class), right);
    }
    if (right.isKnownString()) {
      return doEqualsString((StringExpression) right.convert(String.class), left);
    }
    if (left.isKnownInt() && right.isKnownInt()) {
      return compare(Opcodes.IFEQ, left.convert(long.class), right.convert(long.class));
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return compare(Opcodes.IFEQ, left.convert(double.class), right.convert(double.class));
    }
    return (BoolExpression) MethodRef.RUNTIME_EQUAL.invokeAsBoxedSoyExpression(left, right);
  }

  private BoolExpression doEqualsString(StringExpression stringExpr, SoyExpression other) {
    if (other.isKnownString()) {
      SoyExpression strOther = other.convert(String.class);
      return (BoolExpression) MethodRef.EQUALS.invoke(stringExpr, strOther);
    }
    if (other.isKnownNumber()) {
      // in this case, we actually try to convert stringExpr to a number
      return (BoolExpression) MethodRef.RUNTIME_STRING_EQUALS_AS_NUMBER
          .invoke(stringExpr, other.convert(double.class));
    }
    // We don't know what other is, assume the worst and call out to our boxed implementation
    // TODO(lukes): in this case we know that the first param is a string, maybe we can specialize
    // the runtime to take advantage of this and avoid reboxing the string (and rechecking the type)
    return (BoolExpression) MethodRef.RUNTIME_EQUAL.invokeAsBoxedSoyExpression(stringExpr, other);
  }

  @Override protected final SoyExpression visitLessThanOpNode(LessThanOpNode node) {
    SoyExpression left = visit(node.getChild(0));
    SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return compare(Opcodes.IFLT, left.convert(long.class), right.convert(long.class));
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return compare(Opcodes.IFLT, left.convert(double.class), right.convert(double.class));
    }
    return MethodRef.RUNTIME_LESS_THAN.invokeAsBoxedSoyExpression(left, right);
  }

  @Override protected final SoyExpression visitGreaterThanOpNode(GreaterThanOpNode node) {
    SoyExpression left = visit(node.getChild(0));
    SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return compare(Opcodes.IFGT, left.convert(long.class), right.convert(long.class));
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return compare(Opcodes.IFGT, left.convert(double.class), right.convert(double.class));
    }
    // Note the argument reversal
    return MethodRef.RUNTIME_LESS_THAN.invokeAsBoxedSoyExpression(right, left);
  }

  @Override protected final SoyExpression visitLessThanOrEqualOpNode(LessThanOrEqualOpNode node) {
    SoyExpression left = visit(node.getChild(0));
    SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return compare(Opcodes.IFLE, left.convert(long.class), right.convert(long.class));
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return compare(Opcodes.IFLE, left.convert(double.class), right.convert(double.class));
    }
    return MethodRef.RUNTIME_LESS_THAN_OR_EQUAL.invokeAsBoxedSoyExpression(left, right);
  }

  @Override protected final SoyExpression visitGreaterThanOrEqualOpNode(
      GreaterThanOrEqualOpNode node) {
    SoyExpression left = visit(node.getChild(0));
    SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return compare(Opcodes.IFGE, left.convert(long.class), right.convert(long.class));
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return compare(Opcodes.IFGE, left.convert(double.class), right.convert(double.class));
    }
    // Note the reversal of the arguments.
    return MethodRef.RUNTIME_LESS_THAN_OR_EQUAL.invokeAsBoxedSoyExpression(right, left);
  }

  // Binary operators

  @Override protected final SoyExpression visitPlusOpNode(PlusOpNode node) {
    SoyExpression left = visit(node.getChild(0));
    SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return applyBinaryIntOperator(Opcodes.LADD, left, right);
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return applyBinaryFloatOperator(Opcodes.DADD, left, right);
    }
    // '+' is overloaded for string arguments to mean concatenation.
    if (left.isKnownString() || right.isKnownString()) {
      SoyExpression leftString = left.convert(String.class);
      SoyExpression rightString = right.convert(String.class);
      return (SoyExpression) MethodRef.STRING_CONCAT.invoke(leftString, rightString);
    }
    return MethodRef.RUNTIME_PLUS.invokeAsBoxedSoyExpression(left, right);
  }

  @Override protected final SoyExpression visitMinusOpNode(MinusOpNode node) {
    final SoyExpression left = visit(node.getChild(0));
    final SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return applyBinaryIntOperator(Opcodes.LSUB, left, right);
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return applyBinaryFloatOperator(Opcodes.DSUB, left, right);
    }
    return MethodRef.RUNTIME_MINUS.invokeAsBoxedSoyExpression(left, right);
  }

  @Override protected final SoyExpression visitTimesOpNode(TimesOpNode node) {
    final SoyExpression left = visit(node.getChild(0));
    final SoyExpression right = visit(node.getChild(1));
    if (left.isKnownInt() && right.isKnownInt()) {
      return applyBinaryIntOperator(Opcodes.LMUL, left, right);
    }
    if (left.isKnownNumber() && right.isKnownNumber()) {
      return applyBinaryFloatOperator(Opcodes.DMUL, left, right);
    }

    return MethodRef.RUNTIME_TIMES.invokeAsBoxedSoyExpression(left, right);
  }

  @Override protected final SoyExpression visitDivideByOpNode(DivideByOpNode node) {
    // Note: Soy always performs floating-point division, even on two integers (like JavaScript).
    // Note that this *will* lose precision for longs.
    return applyBinaryFloatOperator(Opcodes.DDIV, visit(node.getChild(0)), visit(node.getChild(1)));
  }

  @Override protected final SoyExpression visitModOpNode(ModOpNode node) {
    // If the underlying expression is not an int, then this will throw a SoyDataExpression at
    // runtime.  This is how the current tofu works.
    // If the expression is known not to be an int, then this will throw an exception at compile
    // time.  This should generally be handled by the type checker. See b/19833234
    return applyBinaryIntOperator(Opcodes.LREM, visit(node.getChild(0)), visit(node.getChild(1)));
  }

  private IntExpression applyBinaryIntOperator(final int operator, SoyExpression left,
      SoyExpression right) {
    final SoyExpression leftInt = left.convert(long.class);
    final SoyExpression rightInt = right.convert(long.class);
    return new IntExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        leftInt.gen(mv);
        rightInt.gen(mv);
        mv.visitInsn(operator);
      }

      @Override boolean isConstant() {
        return leftInt.isConstant() && rightInt.isConstant();
      }
    };
  }

  private FloatExpression applyBinaryFloatOperator(final int operator, SoyExpression left,
      SoyExpression right) {
    final SoyExpression leftInt = left.convert(double.class);
    final SoyExpression rightInt = right.convert(double.class);
    return new FloatExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        leftInt.gen(mv);
        rightInt.gen(mv);
        mv.visitInsn(operator);
      }

      @Override boolean isConstant() {
        return leftInt.isConstant() && rightInt.isConstant();
      }
    };
  }

  // Unary negation

  @Override protected final SoyExpression visitNegativeOpNode(NegativeOpNode node) {
    final SoyExpression child = visit(node.getChild(0));
    if (child.isKnownInt()) {
      final SoyExpression intExpr = child.convert(long.class);
      return new IntExpression() {
        @Override void doGen(GeneratorAdapter mv) {
          intExpr.gen(mv);
          mv.visitInsn(Opcodes.LNEG);
        }
      };
    }
    if (child.isKnownNumber()) {
      final SoyExpression floatExpr = child.convert(double.class);
      return new FloatExpression() {
        @Override void doGen(GeneratorAdapter mv) {
          floatExpr.gen(mv);
          mv.visitInsn(Opcodes.DNEG);
        }
      };
    }
    return MethodRef.RUNTIME_NEGATIVE.invokeAsBoxedSoyExpression(child);
  }

  // Boolean operators

  @Override protected final SoyExpression visitNotOpNode(NotOpNode node) {
    // All values are convertible to boolean
    return logicalNot(visit(node.getChild(0)).convert(boolean.class));
  }

  @Override protected final SoyExpression visitAndOpNode(AndOpNode node) {
    final SoyExpression left = visit(node.getChild(0)).convert(boolean.class);
    final SoyExpression right = visit(node.getChild(1)).convert(boolean.class);
    return new BoolExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        // Note: short circuiting, if left is false we don't eval right
        left.gen(mv);
        Label ifFalsy = new Label();
        Label end = new Label();
        mv.ifZCmp(Opcodes.IFEQ, ifFalsy);
        right.gen(mv);
        mv.goTo(end);
        mv.mark(ifFalsy);
        mv.push(false);
        mv.mark(end);
      }

      @Override boolean isConstant() {
        return left.isConstant() && right.isConstant();
      }
    };
  }

  @Override protected final SoyExpression visitOrOpNode(OrOpNode node) {
    final SoyExpression left = visit(node.getChild(0)).convert(boolean.class);
    final SoyExpression right = visit(node.getChild(1)).convert(boolean.class);
    return new BoolExpression() {
      @Override void doGen(GeneratorAdapter mv) {
        // Note: short circuiting, if left is true we don't eval right
        left.gen(mv);
        Label ifTruthy = new Label();
        Label end = new Label();
        mv.ifZCmp(Opcodes.IFNE, ifTruthy);
        right.gen(mv);
        mv.goTo(end);
        mv.mark(ifTruthy);
        mv.push(true);
        mv.mark(end);
      }

      @Override boolean isConstant() {
        return left.isConstant() && right.isConstant();
      }
    };
  }


  @Override protected final SoyExpression visitConditionalOpNode(ConditionalOpNode node) {
    final BoolExpression condition =
        (BoolExpression) visit(node.getChild(0)).convert(boolean.class);
    final SoyExpression trueBranch = visit(node.getChild(1));
    final SoyExpression falseBranch = visit(node.getChild(2));
    final boolean constant =
        condition.isConstant() && trueBranch.isConstant() && falseBranch.isConstant();
    if (trueBranch.isKnownInt() && falseBranch.isKnownInt()) {
      final SoyExpression trueAsLong = trueBranch.convert(long.class);
      final SoyExpression falseAsLong = falseBranch.convert(long.class);
      return new IntExpression() {
        @Override void doGen(GeneratorAdapter adapter) {
          doCondition(adapter, condition, trueAsLong, falseAsLong);
        }

        @Override boolean isConstant() {
          return constant;
        }
      };
    }
    if (trueBranch.isKnownNumber() && falseBranch.isKnownNumber()) {
      final SoyExpression trueAsFloat = trueBranch.convert(double.class);
      final SoyExpression falseAsFloat = falseBranch.convert(double.class);
      return new FloatExpression() {
        @Override void doGen(GeneratorAdapter adapter) {
          doCondition(adapter, condition, trueAsFloat, falseAsFloat);
        }

        @Override boolean isConstant() {
          return constant;
        }
      };
    }
    if (trueBranch.isKnownString() && falseBranch.isKnownString()) {
      final SoyExpression trueAsString = trueBranch.convert(String.class);
      final SoyExpression falseAsString = falseBranch.convert(String.class);
      return new StringExpression() {
        @Override void doGen(GeneratorAdapter adapter) {
          doCondition(adapter, condition, trueAsString, falseAsString);
        }

        @Override boolean isConstant() {
          return constant;
        }
      };
    }
    // Fallback to boxing and use the type from the type checker as our node type.
    // TODO(lukes): can we do better here? other types? if the types match can we generically unbox?
    // in the common case the runtime type will just be SoyValue, which is not very useful.
    final SoyExpression trueBoxed = trueBranch.box();
    final SoyExpression falseBoxed = falseBranch.box();
    return new BoxedExpression(node.getType().javaType()) {
      @Override void doGen(GeneratorAdapter mv) {
        doCondition(mv, condition, trueBoxed, falseBoxed);
      }

      @Override boolean isConstant() {
        return condition.isConstant() && trueBranch.isConstant() && falseBranch.isConstant();
      }
    };
  }

  private static void doCondition(GeneratorAdapter mv, BoolExpression condition,
      SoyExpression trueBranch, SoyExpression falseBranch) {
    condition.gen(mv);
    Label ifFalse = new Label();
    Label end = new Label();
    mv.visitJumpInsn(Opcodes.IFEQ, ifFalse);  // if 0 goto ifFalse
    trueBranch.gen(mv);  // eval true branch
    mv.visitJumpInsn(Opcodes.GOTO, end);  // jump to the end
    mv.visitLabel(ifFalse);
    falseBranch.gen(mv);  // eval false branch
    mv.visitLabel(end);
  }

  // Left unimplemented for our subclasses which need to specialize how to reference variables.
  @Override protected abstract SoyExpression visitVarRefNode(VarRefNode node);

  @Override protected abstract SoyExpression visitFieldAccessNode(FieldAccessNode node);

  @Override protected abstract SoyExpression visitItemAccessNode(ItemAccessNode node);

  // TODO(lukes): for builtins (isFirst,isLast,index) we need to handcode implementations.
  // For plugins we could simply add the Map<String, SoyJavaFunction> map to Context and pull it
  // out of there.  However, it seems like we should be able to turn some of those calls into
  // static method calls (maybe be stashing instances in static fields in our template
  // classes?).  Or maybe we should have SoyJavaBytecode function implementations that can generate
  // bytecode for their call sites, this would be more similar to what the jssrc backend does.
  @Override protected abstract SoyExpression visitFunctionNode(FunctionNode node);

  @Override protected final SoyExpression visitExprNode(ExprNode node) {
    throw new UnsupportedOperationException(
        "Support for " + node.getKind() + " has node been added yet");
  }

  private int hashMapCapacity(int expectedSize) {
    if (expectedSize < 3) {
      return expectedSize + 1;
    }
    if (expectedSize < Ints.MAX_POWER_OF_TWO) {
      // This is the calculation used in JDK8 to resize when a putAll
      // happens; it seems to be the most conservative calculation we
      // can make.  0.75 is the default load factor.
      return (int) (expectedSize / 0.75F + 1.0F);
    }
    return Integer.MAX_VALUE; // any large value
  }
}
