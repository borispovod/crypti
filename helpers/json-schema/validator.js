var util = require('util');

module.exports = JsonSchema;

var Validator = require('../validator');
var Field = require('./field');

function JsonSchema(options) {
    Validator.call(this, options);
}

util.inherits(JsonSchema, Validator);

JsonSchema.prototype.Field = JsonSchema.Field = Field;

JsonSchema.prototype.rules = JsonSchema.rules = Object.create(Validator.prototype.rules);

JsonSchema.addRule = Validator.addRule;
JsonSchema.addProperty = Validator.addProperty;

// Add fast call
JsonSchema.options = util._extend({}, Validator.options);
JsonSchema.validate = Validator.validate;


JsonSchema.addRule("properties", {
    validate : function(accept, value, field) {
        if (! field.isObject()) return;

        field.async(function(done){
            var result = {};
            var keys = Object.keys(accept);
            var l = keys.length;


            keys.forEach(function(key){
                var child = field.child(key, value[key], accept[key], value);
                child.validate(function(err, report, value){
                    if (err) {
                        done(err, result);
                        l = 0;
                        return;
                    }

                    result[key] = value;

                    if (! --l) {
                        done(err, result);
                    }
                })
            });
        });
    }
});

JsonSchema.addRule("items", {
    validate : function(accept, value, field) {
        if (! Array.isArray(value)) return;

        field.async(function(done){
            var result = [];
            var l = value.length;

            value.forEach(function(item, i){
                var child = field.child(i, item, accept, value);
                child.validate(function(err, report, value){
                    if (err) {
                        done(err, result);
                        l = 0;
                        return;
                    }

                    result[i] = value;

                    // Push error ?
                    if (! --l) {
                        done(err, result);
                    }
                })
            });
        });
    }
});

JsonSchema.addRule("minItems", {
    validate : function(accept, value){
        return Array.isArray(value) && value.length >= accept;
    }
});

JsonSchema.addRule("uniqueItems", {
    validate : function(accept, value, field){
        if (! accept) return;
        if (! Array.isArray(value)) return;

        var i = -1;
        var l = value.length;
        var unique = [];
        var item;

        while(++i < l) {
            item = value[i];

            if (unique.indexOf(item) > 0) {
                field.report({
                    path : i,
                    rule : 'unique',
                    accept : true
                });
            }

            unique.push(item);
        }
        return Array.isArray(value) && value.length >= accept;
    }
});
