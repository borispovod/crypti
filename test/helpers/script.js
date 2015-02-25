var should = require('should');
var scriptHelper = require('../../helpers/script.js');

describe("Script helper.", function(){
    describe("Function `getBytes`.", function(){
        it("Should be a function", function(){
            should(scriptHelper.getBytes).have.type("function");
        });

        it("Should create buffer from script", function(){
            var script = {
                parameters : Buffer("{}").toString("hex"),
                code : Buffer("true").toString("hex"),
                name : "Hello",
                description : ""
            };

            should(scriptHelper.getBytes(script)).be.instanceOf(Buffer);
        });
    });

    describe("Function `getInputBytes`.", function(){
        it("Should be a function", function(){
            should(scriptHelper.getInputBytes).have.type("function");
        });

        it("Should create buffer from input", function() {
            var input = {
                data : Buffer("","hex"),
                scriptId : 1
            };

            should(scriptHelper.getInputBytes(input)).be.instanceOf(Buffer);
        });
    });
});
