/*
 * Copyright 2011 The Closure Compiler Authors.
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

package com.google.javascript.jscomp.parsing.parser.trees;

import com.google.common.collect.ImmutableList;
import com.google.javascript.jscomp.parsing.parser.util.SourceRange;

public class FormalParameterListTree extends ParseTree {
  public final ImmutableList<ParseTree> parameters;

  public FormalParameterListTree(SourceRange location,
      ImmutableList<ParseTree> parameters) {
    super(ParseTreeType.FORMAL_PARAMETER_LIST, location);
    this.parameters = parameters;
  }

  public RestParameterTree getRestParameter() {
    if (hasRestParameter()) {
      return getLastParameter().asRestParameter();
    } else {
      throw new IllegalStateException(
          "formal parameter list has no rest parameter");
    }
  }

  public boolean hasRestParameter() {
    return !parameters.isEmpty() && getLastParameter().isRestParameter();
  }

  private ParseTree getLastParameter() {
    return parameters.get(parameters.size() - 1);
  }
}