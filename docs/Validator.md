# Validator

For input params filtering there is a customizable validator. It uses validation best practices and made for creating
other validators. Validator has two entities `Validator` and `Field`. `Validators` are using for rules collecting  and options
manipulations. And `Fields` are using as a shim between validator, value and model. Validator support sync and async styles.

## Initialization and configuration

Create validator instance is pretty simple:

```
var validator = new Validator({
    // validator options
);

validator.validate(value, model, function(err, report, output){
    // Got validation result
});
```

For immediate validation use constructor's method validate. It creates an instance and run the code immediately. Created
instance got options as initialization values. Example:

```javascript
Validator.options.execRules = false; // turns dynamic rules off

Validator.validate(value, model, function(err, report, output) {
    // Got validation result
});
```

## Result

Resulting callback got 3 arguments: `err`, `report` and `output`. The first is optional error value. `report` is an Array
of validation issues if there is no an issue `report` is empty. `output` is filtered value.

## Add rule

Rule can be added with constructor's method `addRule`. It has two arguments `name` and `descriptor`. Rule descriptor is an
object containing methods `filter` and `validate`. Example:

```javascript
Validator.addRule("type", {
    validate : function(accept, value) {
        return typeof value === accept;
    }
});
```