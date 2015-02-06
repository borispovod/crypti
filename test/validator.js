var should = require('should');

describe("Validator.", function(){
    var Validator;
    Validator = require("../helpers/validator");

    describe("Constructor object.", function(){
        it("Should be a function", function(){
            should(Validator).type("function");
        }) ;

        it('Should add rules', function(){
            Validator.addRule("test", {
                validate : function(){}
            });

            should(Validator.prototype.rules.test).be.an.Object.and.hasOwnProperty('validate').type('function');
        });

        it('Should add field properties to Field prototype', function(){
            Validator.fieldProperty("test", function(){
                return this.value === "test";
            });

            should(Validator.prototype.Field.prototype).be.an.Object.and.hasOwnProperty('test').type('function');
        });

        it('Should validate empty rules', function(done){
            Validator.validate(null, {}, function(err, report){
                should(err).equal(null);
                should(report).instanceOf(Array).length(0);
                done();
            });
        });

        it ('Should validate in sync style', function(){
            var report = Validator.validate(null, {type : "string"});
            should(report).be.an.Array.length(1);
            should(report[0]).be.an.Object.and.hasOwnProperty("rule").equal("type");
        });
    });

    describe("Reporter.", function(){
        it("Should convert issue object to string", function(done){
            // Custom reporter
            var validator = new Validator({
                reporter : function(validator){
                    this.validator = validator;
                    this.convert = function(report){
                        return report.map(function(issue){
                            var path = "instance";
                            if (issue.path.length) {
                                path += "." + issue.path.join(".");
                            }
                            return "Value of " + path + " breaks '" + issue.rule + "' rule.";
                        });
                    }
                }
            });

            should(validator.reporter).type("object").hasOwnProperty("convert").type("function");

            validator.validate(null, {type:"string"}, function(err, report, output){
                should(err).be.equal(null);
                should(report).be.an.Array.length(1);

                var issue = report[0];
                should(issue).be.a.String.and.equal("Value of instance breaks 'type' rule.");
                done();
            });
        });
    })
});