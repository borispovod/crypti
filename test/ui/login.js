var should = require('should');
var Browser = require('../phantom-browser.js');
var spawn = require('child_process').spawn;
var fs = require('fs');

var blockchainPath = 'tmp/blockchain.db';
var testPass = "testpassphrase";

describe('Login screen.', function(){
    var browser;
    var crypti;
    before(function(done){
        browser = new Browser();
        if (fs.exists(blockchainPath)) fs.unlinkSync(blockchainPath);

        crypti = spawn('nodejs', ['app.js','-b','tmp/blockchain.db', '-p', 7000], {stdio:'pipe'});


        browser.addMacros("login", function(browser, password){
            browser.eval(function(){
                    return document.querySelector('#enter') != null;
                })
                .exec(function(enterFound, done){
                    if (! enterFound) return done("Enter text field not found");

                    done();
                })
                .select("#enter")
                .fill(password)
                .select("#login")
                .eval(function(){
                    return document.querySelector('#login') != null;
                })
                .exec(function(loginButtonFound, done){
                    if (! loginButtonFound) return done("Login button not found");

                    done();
                })
                .click()
                .wait(3000)
                .eval(function(){
                    return document.querySelector('#account') != null;
                });
        });

        setTimeout(done, 3000);
    });

    after(function(){
        crypti.kill();
        browser.exit();

        fs.unlinkSync(blockchainPath);
    });

    it('Should open and login', function(done){
        should(crypti).not.equal(null);
        should(crypti.killed).equal(false);

        browser.openTab()
            .resize({width:800, height:600})
            .wait(2000)
            .goto('http://localhost:7000')
            .render('tmp/login.png')
            .macros("login", "testPass")
            .run(function(err, result){
                should(err).equal(null);
                should(result).equal(true);
                done();
            });
    });
});