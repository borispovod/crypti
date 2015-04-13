var should = require('should');
var routerHelper = require('../../helpers/router.js');
var http = require('http');

describe('Router helper.', function(){
    var app, server, router;
    before(function(){
        var express = require('express');
        app = express();
        router = routerHelper();
        app.use(router);
        app.use(function(req, res){
            res.end('OK');
        });
        server = app.listen(0);
    });

    it('Should be a function', function(){
        should(router).have.type('function');
    });

    it('Should add access control headers', function(done){
        http.get({
            hostname: 'localhost',
            port: server.address().port
        }, function(res){
            should(res.statusCode).be.equal(200);
            should(res.headers['access-control-allow-origin']).be.equal('*');
            should(res.headers['access-control-allow-headers']).be.equal('Origin, X-Requested-With, Content-Type, Accept');

            done();
        }).on('error', function(error){
            should(error).be.equal(null);
        });
    });

    it('Should pass control to next middleware', function(done){
        http.get({
            hostname: 'localhost',
            port: server.address().port
        }, function(res){
            res.on('data', function(data){
                should(data.toString()).be.equal('OK');
            });

            res.on('end', done);
        }).on('error', function(error){
            should(error).be.equal(null);
        });
    });
});