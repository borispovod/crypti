var should = require('should');
var Browser = require('../phantom-browser.js');

describe('Navigatiion', function(){
    var server, addr;

    before(function(){
        var http = require('http');
        var url = require('url');

        server = http.createServer(function(req, res){
            // Create multi level age loading
            var parsedUrl = url.parse(req.url, true);

            if (parsedUrl.pathname === '/') {
                res.end('<html><head><title>Page</title><link rel="stylesheet" href="/style.css"></head><body>Test page</body><a id="clickMe" href="/page?n=1">Click me</a></html>');
            } else if (parsedUrl.pathname === '/style.css') {
                res.end('html {font-family:Sans-Serif; color: red}');
            } else {
                setTimeout(function(){
                    var n = parseInt(parsedUrl.query.n) || 0;
                    res.end('<html><head><title>Hello ' + n + '</title></head><body><p>Inner page #' + n + '</p><a id="clickMe" href="/page?n=' + (n + 1) + '">Next page</a></body></html>');
                }, 1000);
            }
        });

        server.listen();

        addr = server.address();
    });

    after(function(){
        server.close();
    });

    describe('goto()', function(){
        it('Should open url presented as an object', function(done){
            Browser.create()
                .goto({
                    hostname: 'localhost',
                    port: addr.port
                })
                .eval(function(){
                    return window.location.toString();
                })
                .run(function(err, result){
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/');
                    done();
                });
        });

        it('Should open url presented as an string', function(done){
            Browser.create()
                .goto('http://localhost:' + addr.port)
                .eval(function(){
                    return window.location.toString()
                })
                .run(function(err, result){
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/');
                    done();
                });
        });
    });

    describe('goBack()', function () {
        it('Should go back to previous page', function(done) {
            Browser.create()
                .goto('http://localhost:' + addr.port)
                .render('tmp/test-go-back.png')
                .click('#clickMe')
                .wait()
                .goBack()
                .eval(function () {
                    return window.location.toString()
                })
                .run(function (err, result) {
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/');
                    done();
                });
        });

        it('Should go back with skipping pages', function(done) {
            Browser.create()
                .goto('http://localhost:' + addr.port)
                .till(4, function(){

                    this
                        .click('#clickMe')
                        .wait();
                })
                .goBack(4)
                .eval(function () {
                    return window.location.toString()
                })
                .run(function (err, result) {
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/');
                    done();
                });
        });
    });

    describe('goForward()', function () {
        it('Should go forward to previous page', function(done) {
            Browser.create()
                .goto('http://localhost:' + addr.port)
                .click('#clickMe')
                .wait() // wait page loading
                .goBack()
                .goForward()
                .eval(function () {
                    return window.location.toString()
                })
                .run(function (err, result) {
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/page?n=1');
                    done();
                });
        });

        it('Should go forward with skipping pages', function(done) {
            Browser.create()
                .goto('http://localhost:' + addr.port)
                .till(5, function(){
                    this.click('#clickMe')
                        .wait();
                })
                .goBack(4)
                .goForward(4)
                .eval(function () {
                    return window.location.toString()
                })
                .run(function (err, result) {
                    should(err).be.equal(null);
                    should(result).have.type('string').and.be.equal('http://localhost:' + addr.port + '/page?n=5');
                    done();
                });
        });
    });

});
