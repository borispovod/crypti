var express = require('express');
var should = require('should');
var http = require('http');
var validation = require('../helpers/request-sanitizer.js');


express()
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
            if (! report.isValid) return res.sendStatus(400);

            res.json(output);
        });
    })
    .listen(12345);

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

describe('Validation express middleware.', function(){
    it('Should return typed values for missed properties', function(done){
        request("http://localhost:12345/", function(err, res){
            should(err).be.equal(null);

            should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
            should(res.data.name).be.a.String.and.be.equal("");
            should(res.data.age).be.a.Number.and.be.equal(0);
            should(res.data.gender).be.a.Boolean.and.be.equal(false);

            done();
        });
    });

    it('Should return ok with query', function(done){
        request("http://localhost:12345/?name=User&age=30&gender=true&bool=x", function(err, res){
            should(err).be.equal(null);

            should(res.data).be.an.Object.and.have.keys("name", "age", "gender");
            should(res.data.name).be.a.String.and.be.equal("User");
            should(res.data.age).be.a.Number.and.be.equal(30);
            should(res.data.gender).be.a.Boolean.and.be.equal(true);

            done();
        });
    });
});