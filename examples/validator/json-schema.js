var JsonSchema = require('../../helpers/json-schema');
var Validator = require('../../helpers/validator');

var value = [1,2,3,4];

var model = {
    items: {
        type : "number"
    },
    minItems : 4,
    uniqueItems : true
};

JsonSchema.validate(value, model, function(err, report, result){
    console.log(err, report, result);
});

