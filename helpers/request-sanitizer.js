var Validator = require('./validator');
var extend = require('extend');
var inherits = require('util').inherits;

function RequestSanitizer(options) {
    Validator.call(this, options);
}

inherits(RequestSanitizer, Validator);

RequestSanitizer.prototype.rules = {};
RequestSanitizer.addRule = Validator.addRule;
RequestSanitizer.fieldProperty = Validator.fieldProperty;

RequestSanitizer.addRule("empty", {});

RequestSanitizer.addRule("string", {
    filter : function(accept, value, field){
        if (field.isEmpty() && field.rules.empty) return null;

        return String(value||'');
    }
});

RequestSanitizer.addRule("boolean", {
    filter : function(accept, value, field){
        if (field.isEmpty() && field.rules.empty) return null;

        switch(String(value).toLowerCase()) {
            case "false":
            case "f":
                return false;
            default:
                return !!value;
        }
    }
});

RequestSanitizer.addRule("int", {
    filter : function(accept, value , field) {
        if (field.isEmpty() && field.rules.empty) return null;

        value = parseInt(value);

        return isNaN(value) ? 0 : value;
    }
});

RequestSanitizer.addRule("float", {
    filter : function(accept, value , field) {
        if (field.isEmpty() && field.rules.empty) return null;

        value = parseFloat(value);

        return isNaN(value) ? 0 : value;
    }
});

RequestSanitizer.addRule("object", {
    filter : function(accept, value , field) {
        if (field.isEmpty() && field.rules.empty) return null;

        value = parseInt(value);

        return isNaN(value) ? 0 : value;
    }
});

RequestSanitizer.addRule("array", {
    filter : function(accept, value, field) {
        if (field.isEmpty() && field.rules.empty) return null;

        return util.isArray(value) ? value : [];
    }
});

RequestSanitizer.addRule("hex", {
    filter : function(accept, value, field) {
        if (field.isEmpty() && field.rules.empty) return null;

        return value;
    },
    validate : function(accept, value, field) {
        if (field.isEmpty() && field.rules.empty) return;

        return /^([A-Fa-f0-9]{2})+$/.test(String(value));
    }
});

RequestSanitizer.addRule("variant", {
    filter : function(accept, value, field) {
        if (field.isEmpty() && field.rules.empty) return null;

        return typeof value === 'undefined' ? '' : value;
    }
});

RequestSanitizer.addRule("all", {
    validate : function(accept, value, field) {
        if (! field.isObject()) return false;

        Object.getOwnPropertyNames(accept).forEach(function(name){
            var child = field.child(name, value[name], accept[name], value);
            child.validate(function(err, report, output){
                if (err) throw err;

                value[name] = output;
            });
        });
    }
});


exports.express = function(options) {
    options = extend({}, RequestSanitizer.options, options);

    function sanitize(value, properties, callback) {
        var values = {};

        Object.getOwnPropertyNames(properties).forEach(function(name){
            values[name] = value.hasOwnProperty(name) ? value[name] : undefined;
        });

        return (new RequestSanitizer(options)).validate(values, {all:properties}, callback);
    }

    return function(req, res, next) {
        req.sanitize = sanitize;

        next();
    };
};