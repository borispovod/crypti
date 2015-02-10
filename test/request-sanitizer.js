var express = require('express');
var should = require('should');
var http = require('http');
var validation = require('../helpers/request-sanitizer.js');


var server;

function request(url, callback) {
    http.get(url, function(res){
        var body = '';
        res.on('data', function(chunk){
            body += chunk;
        });

        res.on('end', function(){
            res.body = body;
            try {
                res.data = JSON.parse(body);
            } catch(err) {
                return callback(err, res);
            }

            callback(null, res);
        });
    }).on('error', callback);
}
describe("Sanitizer.", function(){
    describe("Single methods.", function(){
        // String

        it('Should return a string with string value', function(){
            var value = validation.string('A');

            should(value).be.a.String.and.be.equal('A');
        });

        it("Should return a string with empty value", function(){
            var value = validation.string();

            should(value).be.a.String.length(0);
        });

        // Number

        it("Should return a number with number value", function(){
            var value = validation.int(10);

            should(value).be.a.Number.equal(10);
        });

        it("Should return a number with string value", function(){
            var value = validation.int('10');

            should(value).be.a.Number.equal(10);
        });

        it("Should return a number with empty value", function(){
            var value = validation.int();

            should(value).be.a.Number.equal(0);
        });

        // Boolean

        it("Should return a boolean `false` with string value", function(){
            var value = validation.boolean('false');

            should(value).be.a.Boolean.equal(false);
        });

        it("Should return a boolean `false` with empty value", function(){
            var value = validation.boolean();

            should(value).be.a.Boolean.equal(false);
        });

        // Array

        it("Should return an array with empty value", function(){
            var value = validation.array();

            should(value).be.an.Array.length(0);
        });

        it("Should return an array with array", function(){
            var value = validation.array([1,2,3]);

            should(value).be.an.Array.eql([1,2,3]);
        });

        // Object

        it("Should return an object with empty value", function(){
            var value = validation.object();

            should(value).be.an.Object.eql({});
        });
    });

    describe("Express middleware.", function(){
        before(function(){
            server = express()
                .use(validation.express())
                .get('/', function(req, res, next){
                    req.sanitize(req.query, {
                        name : {
                            string : true
                        },
                        age : {
                            int : true
                        },
                        gender : {
                            boolean : true
                        }
                    }, function(err, report, output){
                        if (err) return next(err);
                        if (! report.isValid) return res.status(400);

                        res.json(output);
                    });
                })
                .get('/required', function(req, res, next){
                    req.sanitize(req.query, {
                        required : {
                            required : true,
                            boolean : true
                        }
                    }, function(err, report, output){
                        if (err) return next(err);
                        if (! report.isValid) return res.status(400).json(report.issues);

                        res.send(output);
                    });
                })
                .get('/complicated', function(req, res, next){
                    req.sanitize(req.query, {
                        name : {
                            required : true,
                            string : true
                        },
                        age : {
                            default : 30,
                            int : true
                        },
                        gender : {
                            required : true,
                            boolean : true
                        }
                    }, function(err, report, query){
                        if (err) return next(err);
                        if (! report.isValid) return res.status(400).json(report.issues);

                        res.json(query);
                    });
                })
                .get("/short", function(req, res, next){
                    req.sanitize("query", {
                        name : "string!",
                        gender : "boolean!",
                        age  : "int?"
                    }, function(err, report, query){
                        if (err) return next(err);
                        if (! report.isValid) return res.status(400).json(report.issues);

                        res.json(query);
                    });
                }).listen(12345);
        });

        it('Should response with typed values for missed properties', function(done){
            request("http://localhost:12345/", function(err, res){
                should(err).be.equal(null);

                should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
                should(res.data.name).be.a.String.and.be.equal("");
                should(res.data.age).be.a.Number.and.be.equal(0);
                should(res.data.gender).be.a.Boolean.and.be.equal(false);

                done();
            });
        });

        it('Should response with typed values on valid query', function(done){
            request("http://localhost:12345/?name=User&age=30&gender=true&bool=x", function(err, res){
                should(err).be.equal(null);

                should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
                should(res.data.name).be.a.String.and.be.equal("User");
                should(res.data.age).be.a.Number.and.be.equal(30);
                should(res.data.gender).be.a.Boolean.and.be.equal(true);

                done();
            });
        });

        it('Should response with 400 on missed required value', function(done){
            request("http://localhost:12345/required", function(err, res){
                should(err).be.equal(null);

                should(res.statusCode).be.equal(400);
                should(res.data).be.a.String.and.match(/"required"/);

                done();
            });
        });

        it('Should return required value', function(done){
            request("http://localhost:12345/required?required=true", function(err, res){
                should(err).be.equal(null);

                should(res.data).be.an.Object.and.have.keys("required");
                should(res.data.required).be.a.Boolean.and.be.equal(true);

                done();
            });
        });

        it('Should response with default values', function(done){
            request("http://localhost:12345/complicated?name=test&gender=false", function(err, res){
                should(err).be.equal(null);

                should(res.statusCode).be.equal(200);
                should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
                should(res.data.name).be.a.String.and.be.equal("test");
                should(res.data.age).be.a.Number.and.be.equal(30);
                should(res.data.gender).be.a.Boolean.and.be.equal(false);

                done();
            });
        });

        it('Should response with 400 on missed several values', function(done){
            request("http://localhost:12345/complicated", function(err, res){
                should(err).be.equal(null);

                should(res.statusCode).be.equal(400);
                should(res.data).be.an.String.and.match(/required/);

                done();
            });
        });

        it('Should response with 200 on short schema', function(done){
            request("http://localhost:12345/short?name=test&gender=true", function(err, res){
                should(err).be.equal(null);

                should(res.statusCode).be.equal(200);
                should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
                should(res.data.name).be.a.String.and.be.equal("test");
                should(res.data.gender).be.a.Boolean.and.be.equal(true);
                should(res.data.age).be.equal(null);

                done();
            });
        });

        it('Should response with 400 on short schema', function(done){
            request("http://localhost:12345/short", function(err, res){
                should(err).be.equal(null);

                should(res.statusCode).be.equal(400);
                should(res.data).be.an.String.and.match(/\Wgender\W/).and.match(/\Wname\W/);

                done();
            });
        });

        after(function(){
            server.close();
        })
    });
});
