// Dependencies
var _extend = require('util')._extend;

// Helpers
function extend(target, source) {
    if (! target || typeof target !== 'object') return target;

    Array.prototype.slice.call(arguments).forEach(function(source){
        if (! source || typeof source !== 'object') return;

        _extend(target, source);
    });

    return target;
}

// Implementation
var Field = require('./field');

module.exports = Validator;
exports.Field = Field;

/**
 * Create validator. Options could have properties `forceAsync`, `skipMissed` and `rules`.
 * @param {object} options
 * @constructor
 */
function Validator(options) {
    options = options||{};

    this.hasError = false;

    this.forceAsync = this.forceAsync || options.forceAsync;
    this.skipMissed = this.skipMissed || options.skipMissed;
    this.execRules = this.execRules || options.execRules;

    this.rules = extend(Object.create(this.rules), options.rules);

    this.onInit();
}

/**
 * Make validation async even if no async rules are used.
 * @type {boolean}
 */
Validator.prototype.forceAsync = false;

/**
 * Don't throw error if rule is missed
 * @type {boolean}
 */
Validator.prototype.skipMissed = false;

/**
 * If rule value is function run it to get value
 * @type {boolean}
 */
Validator.prototype.execRules = true;

/**
 * Check whether rule exists.
 * @param {string} name
 * @returns {boolean}
 */
Validator.prototype.hasRule = function(name) {
    return name in this.rules;
};

/**
 * Get rule descriptor.
 * @param {string} name
 * @returns {*}
 */
Validator.prototype.getRule = function(name){
    if (name in this.rules === false) throw new Error('Rule "' + name + '" doesn\'t defined');
    return this.rules[name];
};

/**
 * Validate values with specified rules set
 * @param {*} value
 * @param {object} rules Set of rules
 * @param {function()} callback Result callback
 */
Validator.prototype.validate = function(value, rules, callback) {
    var self = this;

    var field = this.createField(null, value, rules);
    field.validate(finish);

    function finish() {
        var args = Array.prototype.slice.call(arguments);

        if (! self.forceAsync) {
            self.onEnd();
            callback.apply(null, args);
        } else {
            setTimeout(function(){
                self.onEnd();
                callback.apply(null, args);
            }, 1);
        }
    }
};

/**
 * Validator field constructor
 * @type {Field}
 */
Validator.prototype.Field = Field;

/**
 * Create field instance
 * @param {string|string[]} path Field path
 * @param {*} value Validated value
 * @param {object} rules Rule set
 * @param {*} thisArg Validation methods this reference
 * @returns {Validator.Field}
 */
Validator.prototype.createField = function(path, value, rules, thisArg) {
    return new this.Field(this, path, value, rules, thisArg);
};

/**
 * Set of validator rule descriptors
 * @type {{}}
 */
Validator.prototype.rules = {};

// Internal event handlers
Validator.prototype.onInit = function() {};
Validator.prototype.onError = function(field, err){};
Validator.prototype.onValid = function(field){};
Validator.prototype.onInvalid = function(field){};
Validator.prototype.onEnd = function(){};

// Constructor methods

/**
 * Add validation rule descriptor to validator rule set.
 * @param {string} name Validator name
 * @param {{validate:function,filter:function}} descriptor Validator descriptor object
 */
Validator.addRule = function(name, descriptor){
    if (typeof descriptor !== 'object') {
        throw new Error("Rule descriptor should be an object");
    }

    var self = this;

    this.prototype.rules[name] = descriptor;

    if (descriptor.hasOwnProperty("aliases")) {
        descriptor.aliases.forEach(function(alias){
            self.addAlias(alias, name);
        });
    }
};

/**
 * Add rule alias
 * @param {string} name
 * @param {string} origin
 */
Validator.addAlias = function(name, origin) {
    Object.defineProperty(this.prototype.rules, name, {
        get : function() {
            return this[origin];
        }
    });
};

/**
 * Add extra property to Field. It could be
 * @param name
 * @param value
 */
Validator.fieldProperty = function(name, value){
    this.prototype.Field.prototype[name] = value;
};

/**
 * Validator instance options for fast initialization in method validate.
 * @type {{forceAsync: boolean, skipMissed: boolean}}
 */
Validator.options = {
    forceAsync : false,
    skipMissed : false,
    execRules  : true
};

/**
 * Validate with fast initialization. Use `options` property for constructor instance;
 * @param {*} value Validated value
 * @param {object} rules Set of rules
 * @param {object} customRules Customized rule set. Optional
 * @param {function(err:Error, report:object[], result:*)} callback Result callback
 */
Validator.validate = function(value, rules, customRules, callback) {
    if (typeof customRules === "function") {
        callback = customRules;
        customRules = {};
    }

    var instance = new this(extend({}, this.options, {
        rules : customRules
    }));

    instance.validate(value, rules, callback);
    return instance;
};

// Default rules

Validator.addRule("defaults", {
    description : "Set default value if passed value is undefined",
    filter : function(accept, value) {
        if (typeof value === "undefined"){
            return accept;
        } else {
            return value;
        }
    }
});

Validator.addRule("type", {
    description : "Check value type",
    validate : function(accept, value) {
        return typeof value === accept;
    }
});

Validator.addRule("equal", {
    description : "Check if value equals acceptable value",
    validate : function(accept, value) {
        return value === accept;
    }
});

Validator.addRule("notEqual", {
    description : "Check if value not equals acceptable value",
    validate : function(accept, value) {
        return typeof value !== accept;
    }
});

Validator.addRule("greater", {
    description : "Check if value is greater then acceptable value",
    aliases : [">", "gt"],
    validate : function(accept, value) {
        return typeof value > accept;
    }
});

Validator.addRule("greaterOrEqual", {
    description : "Check if value is greater then or equal acceptable value",
    aliases : [">=", "gte"],
    validate : function(accept, value) {
        return typeof value >= accept;
    }
});

Validator.addRule("less", {
    description : "Check if value is less then acceptable value",
    aliases : ["<", "lt"],
    validate : function(accept, value) {
        return typeof value < accept;
    }
});

Validator.addRule("lessOrEqual", {
    description : "Check if value is less then or equal acceptable value",
    aliases : ["<=", "lte"],
    validate : function(accept, value) {
        return typeof value <= accept;
    }
});

Validator.fieldProperty("isObject", function(){
    return this.value !== null && typeof this.value === "object";
});

Validator.fieldProperty("isObjectInstance", function(){
    return this.value && typeof this.value === "object" && this.value.constructor === Object;
});