# Request Sanitizer

Request sanitizer is data filtration tool based on Validator. But it's goal is to provide clear API for data sanitizing,
safe type converting and error notifying.

## Express middleware

Request sanitizer has express middleware to use it with request object:

```javascript
var RequestSanitizer = require('request-sanitizer');
var express = require('express');

express()
    .use(RequestSanitizer.express())
    .get('/user', function(req, res, next) {
        req.sanitize("query", {
            id : {
                required : true,
                int : true
            }
        }, function(err, report, query) {
            // ...
        });
    });
```

Express middleware accept one argument `options` which is a usual Validator options object.

## req.sanitize(value, rules, callback*) -> report

Main sanitizing method. It got `values`. Validate them with `rules` and then execute to `callback` which is _optional_. If
callback is not found then sync mode will turned on. Value could be object or name of request property. Example calls are
equals:

```javascript
req.sanitize(req.query, {});
req.sanitize("query", {});
```

### Rules format
Rules object have long and short notations to describe request input values. Long notation looks like usual Validator
validation rule.

```javascript
{
    name : {
        required : true,
        string : true
    }
}
```

__Note__ that rules order is important!

And short notation allow to pass only rule name:
```javascript
{
    name : "string!" // equal to {required:true, string:true}
}
```

Short notation value has format `<rule> <modifier>` where rule is rule name and modifier is '!' (required) or '?' (empty).

Result callback get three arguments: error, report and result. Where error is internal validator error, report is usual
Validator report and result is filtered values. If callback not set than Validator turn synchronous mode in which any
attempt to call async rule will throw an Error. 

## Sanitizer rules

| Rule         | Accept  | Description |
|:-------------|:--------|:------------------------|
| `required`   | boolean | Check whether value is exists.   |
| `empty`      | boolean | Indicate that value could null or undefined.    |
| `default`    | *       | Set default value if it not defined.    |
| `string`     | *       | Convert value to string. |
| `int`        | *       | Convert value to number with parseInt.    |
| `float`      | *       | Convert value to number with parseFloat.    |
| `boolean`    | *       | Convert value to boolean. |
| `array`      | *       | Check if value is an Array. If not return `[]`.   |
| `object`     | *       | Check if value is object. If not return `{}`. |
| `variant`    | *       | Check if value is not undefined otherwise return `''`.    |
| `hex`        | *       | Check if value is a valid hex.    |
| `buffer`     | boolean, string | Convert value to buffer. If accept is string than use it as buffer encoding.     |
| `properties` | object | Check value as object and validate all it's properties. Accept should be object with rules   |
| `minLength`  | number | Check minimum string or array length.   |
| `maxLength`  | number | Check maximum string or array length.   |
| `minByteLength` | number, object | Check minimum string length in bytes.   |
| `maxByteLength` | number, object | Check maximum string length in bytes.   |

### array

Array rule allows to convert input value to Array. If value is mon empty string and accept value is string, then value
splits with accept as delimiter. Example:
```javascript
{
    ids : {
        array : ',' // split string into array with delimiter
    }
}
```

### minByteLength, maxByteLength

This validation is dependant on string encoding. By default strings are utf8 encoded. If you need to change it than
specify encoding passing object as accepted value. Example:
```javascript
{
    file : {
        hex : true,
        buffer : true,
        minByteLength : {
            encoding : 'hex',
            length : 4 * 1024 // 4 Kb
        }
    }
}
```

## Direct call

RequestSanitizer filters could be used directly. It allow to filter single value. Each filter call has two arguments:
`value` and `extra` properties. If extra properties set to true than filtered value could be undefined, null or ''. If
 extra properties is an object than it uses as a validator rules. Example:

```javascript
// Normal call
RequestSanitizer.array([1, 2]); // -> [1, 2]
// Convert null-like value to Array
RequestSanitizer.array(); // -> []
// Convert null-like value to Array
RequestSanitizer.array('', true); // -> []
// Allow empty value. Returns null
RequestSanitizer.array(undefined, true); // -> null
// Replace null-like object. Returns null
RequestSanitizer.array(null, {default:[1,2,3]}); // -> [1,2,3]
```


