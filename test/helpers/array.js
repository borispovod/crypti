var should = require('should');

var arrayHelpers = require('../../helpers/array.js');

describe('Array helper.', function(){
    describe("Function `hash2array`.", function(){
        it("It should to be a function", function(){
            should(arrayHelpers.hash2array).type("function");
        });

        it("Should convert hash to array", function(){
            should(arrayHelpers.hash2array({a:1,b:2})).be.an.Array.and.be.eql([1,2]);
        });

        it("Should convert empty hash to empty array", function(){
            should(arrayHelpers.hash2array({})).be.an.Array.and.be.eql([]);
        });
    });

    describe("Function `extend`.", function(){
        it("It should to be a function", function(){
            should(arrayHelpers.extend).type("function");
        });

        it("Should extend object with another", function(){
            should(arrayHelpers.extend({}, {a:1})).be.an.Object.and.be.eql({a:1});
        })
    });
});

