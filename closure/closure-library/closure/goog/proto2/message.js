/**
 * @license
 * Copyright The Closure Library Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Protocol Buffer Message base class.
 * @suppress {unusedPrivateMembers} For descriptor_ declaration.
 */

goog.provide('goog.proto2.Message');

goog.require('goog.asserts');
goog.require('goog.proto2.Descriptor');
goog.require('goog.proto2.FieldDescriptor');
goog.requireType('goog.proto2.LazyDeserializer');



/**
 * Abstract base class for all Protocol Buffer 2 messages. It will be
 * subclassed in the code generated by the Protocol Compiler. Any other
 * subclasses are prohibited.
 * @constructor
 */
goog.proto2.Message = function() {
  /**
   * Stores the field values in this message. Keyed by the tag of the fields.
   * @type {!Object}
   * @private
   */
  this.values_ = {};

  /**
   * Stores the field information (i.e. metadata) about this message.
   * @type {Object<number, !goog.proto2.FieldDescriptor>}
   * @private
   */
  this.fields_ = this.getDescriptor().getFieldsMap();

  /**
   * The lazy deserializer for this message instance, if any.
   * @type {?goog.proto2.LazyDeserializer}
   * @private
   */
  this.lazyDeserializer_ = null;

  /**
   * A map of those fields deserialized, from tag number to their deserialized
   * value.
   * @type {?Object}
   * @private
   */
  this.deserializedFields_ = null;
};


/**
 * An enumeration defining the possible field types.
 * Should be a mirror of that defined in descriptor.h.
 *
 * TODO(user): Remove this alias.  The code generator generates code that
 * references this enum, so it needs to exist until the code generator is
 * changed.  The enum was moved to from Message to FieldDescriptor to avoid a
 * dependency cycle.
 *
 * Use goog.proto2.FieldDescriptor.FieldType instead.
 *
 * @enum {number}
 */
goog.proto2.Message.FieldType = {
  DOUBLE: 1,
  FLOAT: 2,
  INT64: 3,
  UINT64: 4,
  INT32: 5,
  FIXED64: 6,
  FIXED32: 7,
  BOOL: 8,
  STRING: 9,
  GROUP: 10,
  MESSAGE: 11,
  BYTES: 12,
  UINT32: 13,
  ENUM: 14,
  SFIXED32: 15,
  SFIXED64: 16,
  SINT32: 17,
  SINT64: 18
};


/**
 * All instances of goog.proto2.Message should have a static descriptor_
 * property. The Descriptor will be deserialized lazily in the getDescriptor()
 * method.
 *
 * This declaration is just here for documentation purposes.
 * goog.proto2.Message does not have its own descriptor.
 *
 * @type {undefined}
 * @private
 */
goog.proto2.Message.descriptor_;


/**
 * Initializes the message with a lazy deserializer and its associated data.
 * This method should be called by internal methods ONLY.
 *
 * @param {goog.proto2.LazyDeserializer} deserializer The lazy deserializer to
 *   use to decode the data on the fly.
 *
 * @param {?} data The data to decode/deserialize.
 */
goog.proto2.Message.prototype.initializeForLazyDeserializer = function(
    deserializer, data) {

  this.lazyDeserializer_ = deserializer;
  this.values_ = data;
  this.deserializedFields_ = {};
};


/**
 * Sets the value of an unknown field, by tag.
 *
 * @param {number} tag The tag of an unknown field (must be >= 1).
 * @param {*} value The value for that unknown field.
 */
goog.proto2.Message.prototype.setUnknown = function(tag, value) {
  goog.asserts.assert(
      !this.fields_[tag], 'Field is not unknown in this message');
  goog.asserts.assert(
      tag >= 1, 'Tag ' + tag + ' has value "' + value + '" in descriptor ' +
          this.getDescriptor().getName());

  goog.asserts.assert(value !== null, 'Value cannot be null');

  this.values_[tag] = value;
  if (this.deserializedFields_) {
    delete this.deserializedFields_[tag];
  }
};


/**
 * Iterates over all the unknown fields in the message.
 *
 * @param {function(this:T, number, *)} callback A callback method
 *     which gets invoked for each unknown field.
 * @param {T=} opt_scope The scope under which to execute the callback.
 *     If not given, the current message will be used.
 * @template T
 */
goog.proto2.Message.prototype.forEachUnknown = function(callback, opt_scope) {
  var scope = opt_scope || this;
  for (var key in this.values_) {
    var keyNum = Number(key);
    if (!this.fields_[keyNum]) {
      callback.call(scope, keyNum, this.values_[key]);
    }
  }
};


/**
 * Returns the descriptor which describes the current message.
 *
 * This only works if we assume people never subclass protobufs.
 *
 * @return {!goog.proto2.Descriptor} The descriptor.
 */
goog.proto2.Message.prototype.getDescriptor = goog.abstractMethod;


/**
 * Returns whether there is a value stored at the field specified by the
 * given field descriptor.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to check
 *     if there is a value.
 *
 * @return {boolean} True if a value was found.
 */
goog.proto2.Message.prototype.has = function(field) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  return this.has$Value(field.getTag());
};


/**
 * Returns the array of values found for the given repeated field.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to
 *     return the values.
 *
 * @return {!Array<?>} The values found.
 */
goog.proto2.Message.prototype.arrayOf = function(field) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  return this.array$Values(field.getTag());
};


/**
 * Returns the number of values stored in the given field.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to count
 *     the number of values.
 *
 * @return {number} The count of the values in the given field.
 */
goog.proto2.Message.prototype.countOf = function(field) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  return this.count$Values(field.getTag());
};


/**
 * Returns the value stored at the field specified by the
 * given field descriptor.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to get the
 *     value.
 * @param {number=} opt_index If the field is repeated, the index to use when
 *     looking up the value.
 *
 * @return {?} The value found or null if none.
 */
goog.proto2.Message.prototype.get = function(field, opt_index) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  return this.get$Value(field.getTag(), opt_index);
};


/**
 * Returns the value stored at the field specified by the
 * given field descriptor or the default value if none exists.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to get the
 *     value.
 * @param {number=} opt_index If the field is repeated, the index to use when
 *     looking up the value.
 *
 * @return {?} The value found or the default if none.
 */
goog.proto2.Message.prototype.getOrDefault = function(field, opt_index) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  return this.get$ValueOrDefault(field.getTag(), opt_index);
};


/**
 * Stores the given value to the field specified by the
 * given field descriptor. Note that the field must not be repeated.
 *
 * @param {goog.proto2.FieldDescriptor} field The field for which to set
 *     the value.
 * @param {*} value The new value for the field.
 */
goog.proto2.Message.prototype.set = function(field, value) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  this.set$Value(field.getTag(), value);
};


/**
 * Adds the given value to the field specified by the
 * given field descriptor. Note that the field must be repeated.
 *
 * @param {goog.proto2.FieldDescriptor} field The field in which to add the
 *     the value.
 * @param {*} value The new value to add to the field.
 */
goog.proto2.Message.prototype.add = function(field, value) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  this.add$Value(field.getTag(), value);
};


/**
 * Clears the field specified.
 *
 * @param {goog.proto2.FieldDescriptor} field The field to clear.
 */
goog.proto2.Message.prototype.clear = function(field) {
  goog.asserts.assert(
      field.getContainingType() == this.getDescriptor(),
      'The current message does not contain the given field');

  this.clear$Field(field.getTag());
};


/**
 * Compares this message with another one ignoring the unknown fields.
 * @param {?} other The other message.
 * @return {boolean} Whether they are equal. Returns false if the `other`
 *     argument is a different type of message or not a message.
 */
goog.proto2.Message.prototype.equals = function(other) {
  if (!other || this.constructor != other.constructor) {
    return false;
  }

  var fields = this.getDescriptor().getFields();
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var tag = field.getTag();
    if (this.has$Value(tag) != other.has$Value(tag)) {
      return false;
    }

    if (this.has$Value(tag)) {
      var isComposite = field.isCompositeType();

      var fieldsEqual = function(value1, value2) {
        return isComposite ? value1.equals(value2) : value1 == value2;
      };

      var thisValue = this.getValueForTag_(tag);
      var otherValue = other.getValueForTag_(tag);

      if (field.isRepeated()) {
        // In this case thisValue and otherValue are arrays.
        if (thisValue.length != otherValue.length) {
          return false;
        }
        for (var j = 0; j < thisValue.length; j++) {
          if (!fieldsEqual(thisValue[j], otherValue[j])) {
            return false;
          }
        }
      } else if (!fieldsEqual(thisValue, otherValue)) {
        return false;
      }
    }
  }

  return true;
};


/**
 * Recursively copies the known fields from the given message to this message.
 * Removes the fields which are not present in the source message.
 * @param {!goog.proto2.Message} message The source message.
 */
goog.proto2.Message.prototype.copyFrom = function(message) {
  goog.asserts.assert(
      this.constructor == message.constructor,
      'The source message must have the same type.');

  if (this != message) {
    this.values_ = {};
    if (this.deserializedFields_) {
      this.deserializedFields_ = {};
    }
    this.mergeFrom(message);
  }
};


/**
 * Merges the given message into this message.
 *
 * Singular fields will be overwritten, except for embedded messages which will
 * be merged. Repeated fields will be concatenated.
 * @param {!goog.proto2.Message} message The source message.
 */
goog.proto2.Message.prototype.mergeFrom = function(message) {
  goog.asserts.assert(
      this.constructor == message.constructor,
      'The source message must have the same type.');
  var fields = this.getDescriptor().getFields();

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var tag = field.getTag();
    if (message.has$Value(tag)) {
      if (this.deserializedFields_) {
        delete this.deserializedFields_[field.getTag()];
      }

      var isComposite = field.isCompositeType();
      if (field.isRepeated()) {
        var values = message.array$Values(tag);
        for (var j = 0; j < values.length; j++) {
          this.add$Value(tag, isComposite ? values[j].clone() : values[j]);
        }
      } else {
        var value = message.getValueForTag_(tag);
        if (isComposite) {
          var child = this.getValueForTag_(tag);
          if (child) {
            child.mergeFrom(value);
          } else {
            this.set$Value(tag, value.clone());
          }
        } else {
          this.set$Value(tag, value);
        }
      }
    }
  }
};


/**
 * @return {!goog.proto2.Message} Recursive clone of the message only including
 *     the known fields.
 */
goog.proto2.Message.prototype.clone = function() {
  /** @type {!goog.proto2.Message} */
  var clone = new this.constructor;
  clone.copyFrom(this);
  return clone;
};


/**
 * Fills in the protocol buffer with default values. Any fields that are
 * already set will not be overridden.
 * @param {boolean} simpleFieldsToo If true, all fields will be initialized;
 *     if false, only the nested messages and groups.
 */
goog.proto2.Message.prototype.initDefaults = function(simpleFieldsToo) {
  var fields = this.getDescriptor().getFields();
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var tag = field.getTag();
    var isComposite = field.isCompositeType();

    // Initialize missing fields.
    if (!this.has$Value(tag) && !field.isRepeated()) {
      if (isComposite) {
        this.values_[tag] = new /** @type {Function} */ (field.getNativeType());
      } else if (simpleFieldsToo) {
        this.values_[tag] = field.getDefaultValue();
      }
    }

    // Fill in the existing composite fields recursively.
    if (isComposite) {
      if (field.isRepeated()) {
        var values = this.array$Values(tag);
        for (var j = 0; j < values.length; j++) {
          values[j].initDefaults(simpleFieldsToo);
        }
      } else {
        this.get$Value(tag).initDefaults(simpleFieldsToo);
      }
    }
  }
};


/**
 * Returns the whether or not the field indicated by the given tag
 * has a value.
 *
 * GENERATED CODE USE ONLY. Basis of the has{Field} methods.
 *
 * @param {number} tag The tag.
 *
 * @return {boolean} Whether the message has a value for the field.
 */
goog.proto2.Message.prototype.has$Value = function(tag) {
  return this.values_[tag] != null;
};


/**
 * Returns the value for the given tag number. If a lazy deserializer is
 * instantiated, lazily deserializes the field if required before returning the
 * value.
 *
 * @param {number} tag The tag number.
 * @return {?} The corresponding value, if any.
 * @private
 */
goog.proto2.Message.prototype.getValueForTag_ = function(tag) {
  // Retrieve the current value, which may still be serialized.
  var value = this.values_[tag];
  if (value == null) {
    return null;
  }

  // If we have a lazy deserializer, then ensure that the field is
  // properly deserialized.
  if (this.lazyDeserializer_) {
    // If the tag is not deserialized, then we must do so now. Deserialize
    // the field's value via the deserializer.
    if (!(tag in /** @type {!Object} */ (this.deserializedFields_))) {
      var deserializedValue = this.lazyDeserializer_.deserializeField(
          this, this.fields_[tag], value);
      this.deserializedFields_[tag] = deserializedValue;
      return deserializedValue;
    }

    return this.deserializedFields_[tag];
  }

  // Otherwise, just return the value.
  return value;
};


/**
 * Gets the value at the field indicated by the given tag.
 *
 * GENERATED CODE USE ONLY. Basis of the get{Field} methods.
 *
 * @param {number} tag The field's tag index.
 * @param {number=} opt_index If the field is a repeated field, the index
 *     at which to get the value.
 *
 * @return {?} The value found or null for none.
 * @protected
 */
goog.proto2.Message.prototype.get$Value = function(tag, opt_index) {
  var value = this.getValueForTag_(tag);

  if (this.fields_[tag].isRepeated()) {
    var index = opt_index || 0;
    goog.asserts.assert(
        index >= 0 && index < value.length,
        'Given index %s is out of bounds.  Repeated field length: %s', index,
        value.length);
    return value[index];
  }

  return value;
};


/**
 * Gets the value at the field indicated by the given tag or the default value
 * if none.
 *
 * GENERATED CODE USE ONLY. Basis of the get{Field} methods.
 *
 * @param {number} tag The field's tag index.
 * @param {number=} opt_index If the field is a repeated field, the index
 *     at which to get the value.
 *
 * @return {?} The value found or the default value if none set.
 * @protected
 */
goog.proto2.Message.prototype.get$ValueOrDefault = function(tag, opt_index) {
  if (!this.has$Value(tag)) {
    // Return the default value.
    var field = this.fields_[tag];
    return field.getDefaultValue();
  }

  return this.get$Value(tag, opt_index);
};


/**
 * Gets the values at the field indicated by the given tag.
 *
 * GENERATED CODE USE ONLY. Basis of the {field}Array methods.
 *
 * @param {number} tag The field's tag index.
 *
 * @return {!Array<?>} The values found. If none, returns an empty array.
 * @protected
 */
goog.proto2.Message.prototype.array$Values = function(tag) {
  var value = this.getValueForTag_(tag);
  return value || [];
};


/**
 * Returns the number of values stored in the field by the given tag.
 *
 * GENERATED CODE USE ONLY. Basis of the {field}Count methods.
 *
 * @param {number} tag The tag.
 *
 * @return {number} The number of values.
 * @protected
 */
goog.proto2.Message.prototype.count$Values = function(tag) {
  var field = this.fields_[tag];
  if (field.isRepeated()) {
    return this.has$Value(tag) ? this.values_[tag].length : 0;
  } else {
    return this.has$Value(tag) ? 1 : 0;
  }
};


/**
 * Sets the value of the *non-repeating* field indicated by the given tag.
 *
 * GENERATED CODE USE ONLY. Basis of the set{Field} methods.
 *
 * @param {number} tag The field's tag index.
 * @param {*} value The field's value.
 * @protected
 */
goog.proto2.Message.prototype.set$Value = function(tag, value) {
  if (goog.asserts.ENABLE_ASSERTS) {
    var field = this.fields_[tag];
    this.checkFieldType_(field, value);
  }

  this.values_[tag] = value;
  if (this.deserializedFields_) {
    this.deserializedFields_[tag] = value;
  }
};


/**
 * Adds the value to the *repeating* field indicated by the given tag.
 *
 * GENERATED CODE USE ONLY. Basis of the add{Field} methods.
 *
 * @param {number} tag The field's tag index.
 * @param {*} value The value to add.
 * @protected
 */
goog.proto2.Message.prototype.add$Value = function(tag, value) {
  if (goog.asserts.ENABLE_ASSERTS) {
    var field = this.fields_[tag];
    this.checkFieldType_(field, value);
  }

  if (!this.values_[tag]) {
    this.values_[tag] = [];
  }

  this.values_[tag].push(value);
  if (this.deserializedFields_) {
    delete this.deserializedFields_[tag];
  }
};


/**
 * Ensures that the value being assigned to the given field
 * is valid.
 *
 * @param {!goog.proto2.FieldDescriptor} field The field being assigned.
 * @param {*} value The value being assigned.
 * @private
 */
goog.proto2.Message.prototype.checkFieldType_ = function(field, value) {
  if (field.getFieldType() == goog.proto2.FieldDescriptor.FieldType.ENUM) {
    goog.asserts.assertNumber(value);
  } else {
    goog.asserts.assert(Object(value).constructor == field.getNativeType());
  }
};


/**
 * Clears the field specified by tag.
 *
 * GENERATED CODE USE ONLY. Basis of the clear{Field} methods.
 *
 * @param {number} tag The tag of the field to clear.
 * @protected
 */
goog.proto2.Message.prototype.clear$Field = function(tag) {
  delete this.values_[tag];
  if (this.deserializedFields_) {
    delete this.deserializedFields_[tag];
  }
};


/**
 * Creates the metadata descriptor representing the definition of this message.
 *
 * @param {function(new:goog.proto2.Message)} messageType Constructor for the
 *     message type to which this metadata applies.
 * @param {!Object} metadataObj The object containing the metadata.
 * @return {!goog.proto2.Descriptor} The new descriptor.
 */
goog.proto2.Message.createDescriptor = function(messageType, metadataObj) {
  var fields = [];
  var descriptorInfo = metadataObj[0];

  for (var key in metadataObj) {
    if (key != 0) {
      // Create the field descriptor.
      fields.push(
          new goog.proto2.FieldDescriptor(messageType, key, metadataObj[key]));
    }
  }

  return new goog.proto2.Descriptor(messageType, descriptorInfo, fields);
};
