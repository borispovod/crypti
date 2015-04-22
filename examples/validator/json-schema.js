require('colors');

var JsonSchema = require('../../helpers/json-schema');
var Validator = require('../../helpers/validator');
var Table = require('cli-table');

var model = {
    properties : {
        array : {
            type : "array",
            items : {
                type : "number",
                minimum : 1,
                maximum : 3,
                divisibleBy : 2
            }
        },
        string : {
            type : "string",
            minLength : 2,
            maxLength : 5,
            enum : ["hi", "hello"],
            pattern : "^\\w+$"
        },
        insert : {
            type : "string",
            default : "Yeah"
        }
    },
    required : ["array", "string"],
    additionalProperties : {
        type : "number"
    },
    minProperties : 2,
    maxProperties : 4
};

var value = {
    array : [1,2,3,4],
    string : "hi",
    property1  : true,
    property2  : 100
};


JsonSchema.validate(value, model, function(err, report, output){
    if (err) {
        console.log(err.stack || err);
    } else if (report.length) {
        var table = new Table({
            head : ['Path', 'Rule', 'Accept'],
            style : {head:['bold']}
        });

        report.forEach(function(issue){
            table.push([
                [''].concat(issue.path).join('/').grey,
                issue.rule,
                String(issue.accept).yellow
            ]);
        });

        console.log('\nValidation Issues\n'.toUpperCase());
        console.log(table.toString());
    } else {
        console.log('Filtered values', output);
    }
});

