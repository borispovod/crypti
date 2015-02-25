
var should = require("should");
var signatureHelper = require("../../helpers/signature.js");

describe("Signature helper.", function(){
    describe("Function `getBytes`.", function(){
        it("Should be a function", function(){
            should(signatureHelper.getBytes).have.type("function");
        });

        it("Should return Buffer", function(){
            var signature = {
                publicKey:Buffer("test").toString("hex")
            };
            should(signatureHelper.getBytes(signature)).be.instanceOf(Buffer);
        });
    });

    describe("Function `getId`.", function(){
        it("Should be a function", function(){
            should(signatureHelper.getBytes).have.type("function");
        });

        it("Should return string", function(){
            var signature = {
                publicKey:Buffer("test").toString("hex")
            };
            should(signatureHelper.getId(signature)).be.instanceOf(String);
        });
    });

    describe("Function `getHash`.", function(){
        it("Should be a function", function(){
            should(signatureHelper.getBytes).have.type("function");
        });

        it("Should return Buffer", function(){
            var signature = {
                publicKey:Buffer("test").toString("hex")
            };
            should(signatureHelper.getHash(signature)).be.instanceOf(Buffer);
        });
    });
});