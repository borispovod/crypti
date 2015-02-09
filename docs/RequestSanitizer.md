# Request Sanitizer

Request sanitizer is data filtration tool based on Validator. But it's goal is to provide clear API for data sanitizing,
safe type converting and error notifying.

## Usage

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

| Rule       | Accept  | Description |
|:-----------|:--------|:------------------------|
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


