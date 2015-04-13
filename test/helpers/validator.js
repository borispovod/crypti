var should = require('should');

describe("Validator.", function(){
    var Validator;
    Validator = require("../../helpers/validator");

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
                should(report.issues).instanceOf(Array).length(0);
                done();
            });
        });

        it ('Should validate in sync style', function(){
            var report = Validator.validate(null, {type : "string"});
            should(report.issues).be.an.Array.length(1);
            should(report.issues[0]).be.an.Object.and.hasOwnProperty("rule").equal("type");
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
                should(report.issues).be.an.Array.length(1);

                var issue = report.issues[0];
                should(issue).be.a.String.and.equal("Value of instance breaks 'type' rule.");
                done();
            });
        });
    });

    describe('Utils', function(){
        describe('Extend()', function(){
            it('Should add property', function(){
                var a = {};
                var b = {a:1};

                utils.extend(a, b);

                should(a).have.ownProperty('a');
            });

            it('Should add nested property', function(){
                var a = {a:{}};
                var b = {a:{c:1}};

                utils.extend(a, b);

                should(a).have.ownProperty('a').which.is.an.Object.and.equal(b.a);
                deepEqual(a, b);
                should(a.a).have.type('object').and.ownProperty('c').which.equal(1);
            });

            it('Replace instances with last the last one occurrence', function(){
                var native = {};
                var instance = new (function() {});

                var data = utils.extend({native:{},instance:{}}, {
                    native: native,
                    instance: instance
                });

                should(data).have.type('object');
                // Object copied
                should(data.native).have.type('object').and.equal(native);
                // Instance copied
                should(data.instance).have.type('object').and.equal(instance);
            });
        });

        describe('Copy()', function(){
            it('Should copy nested object', function(){
                var a = utils.copy({n:1,b:true,o:{},a:[1,2,3]});

                should(a).have.type('object').and.be.instanceOf(Object);
                should(a.n).have.type('number').and.equal(1);
                should(a.b).have.type('boolean').and.equal(true);
                should(a.o).have.type('object');
                deepEqual(a.o, {});
                should(a.a).be.an.instanceOf(Array).and.have.lengthOf(3);
            });

            it('Should copy only NativeObject', function(){
                var native = {};
                var instance = new (function() {});

                var data = utils.copy({
                    native: native,
                    instance: instance
                });

                should(data).have.type('object');
                // Object copied
                should(data.native).have.type('object').and.not.equal(native);
                // Object passed as is
                should(data.instance).have.type('object').and.equal(instance);
            });
        });
    });
});