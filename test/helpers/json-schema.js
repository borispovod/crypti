var should = require('should');

describe('Validator.', function(){
    var JsonSchema = require('../../helpers/json-schema');

    describe("Module.", function() {
        it('Should be a function', function(){
            should(JsonSchema).type('function');
        });

        it('Should has `validate` method', function(){
            should(JsonSchema).hasOwnProperty('validate').type('function');
        });
    });

    describe("Common rules.", function(){
        it('Should report.issues an issue for type', function(done){
            JsonSchema.validate("Hello", {type:"number"}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('type');
                done();
            });
        });

        it('Should report.issues an issue for enum', function(done){
            JsonSchema.validate(2, {enum:[1,5]}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('enum');
                done();
            });
        });
    });

    describe('String rules.', function(){
        it('Should report.issues an issue for minLength', function(done){
            JsonSchema.validate("Hello", {minLength:10}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('minLength');
                done();
            });
        });

        it('Should report.issues an issue for maxLength', function(done){
            JsonSchema.validate("Hello", {maxLength:2}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('maxLength');
                done();
            });
        });

        it('Should report.issues an issue for string pattern', function(done){
            JsonSchema.validate("Hello", {pattern:/^[a-z]+$/}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('pattern');
                done();
            });
        });
    });

    describe('Number rules.', function(){
        it("Should report.issues an issue for minimum", function(done){
            JsonSchema.validate(10, {minimum:11}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('minimum');
                done();
            });
        });

        it("Should report.issues an issue for minimum with exclusiveMinimum", function(done){
            JsonSchema.validate(10, {minimum:10, exclusiveMinimum:true}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('minimum');
                done();
            });
        });

        it("Should report.issues an issue for maximum", function(done){
            JsonSchema.validate(10, {maximum:9}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('maximum');
                done();
            });
        });

        it("Should report.issues an issue for maximum with exclusiveMaximum", function(done){
            JsonSchema.validate(10, {maximum:10, exclusiveMaximum:true}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('maximum');
                done();
            });
        });

        it("Should report.issues an issue for divisibleBy", function(done){
            JsonSchema.validate(10, {divisibleBy:3}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('divisibleBy');
                done();
            });
        });
    });

    describe("Array rules.", function(){
        it("Should report.issues an issue for items", function(done){
            JsonSchema.validate([0,null], {items:{type:"number"}}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0].path.join('.')).equal('1');
                should(report.issues[0]).hasOwnProperty('rule').equal('type');
                done();
            });
        });

        it("Should report.issues an issue for minItems", function(done){
            JsonSchema.validate(new Array(1), {minItems:2}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('minItems');
                done();
            });
        });

        it("Should report.issues an issue for maxItems", function(done){
            JsonSchema.validate(new Array(1), {maxItems:0}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('maxItems');
                done();
            });
        });

        it("Should report.issues an issue for uniqueItems", function(done){
            JsonSchema.validate([1,1], {uniqueItems:true}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('uniqueItems');
                done();
            });
        });
    });

    describe("Object rules.", function(){
        it("Should report.issues an issue for properties", function(done){
            JsonSchema.validate({a:null}, {properties:{a:{type:"number"}}}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0].path.join('.')).equal('a');
                should(report.issues[0]).hasOwnProperty('rule').equal('type');
                done();
            });
        });

        it("Should report.issues an issue for required", function(done){
            JsonSchema.validate({}, {properties:{a:{type:"number"}}, required:["a"]}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0].path.join('.')).equal('a');
                should(report.issues[0]).hasOwnProperty('rule').equal('required');
                done();
            });
        });

        it("Should report.issues an issue for additionalProperties", function(done){
            JsonSchema.validate({b:null}, {properties:{}, additionalProperties:{type:"number"}}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0].path.join('.')).equal('b');
                should(report.issues[0]).hasOwnProperty('rule').equal('type');
                done();
            });
        });

        it("Should report.issues an issue for minProperties", function(done){
            JsonSchema.validate({}, {minProperties:1}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('minProperties');
                done();
            });
        });

        it("Should report.issues an issue for maxProperties", function(done){
            JsonSchema.validate({a:1}, {maxProperties:0}, function(err, report){
                should(err).equal(null);
                should(report.issues).be.an.Array.length(1);
                should(report.issues[0]).hasOwnProperty('rule').equal('maxProperties');
                done();
            });
        });
    });

});