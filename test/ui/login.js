var should = require("should");
var Browser = require("../phantom-browser.js");
var spawn = require("child_process").spawn;
var fs = require("fs");


var blockchainPath = "tmp/blockchain.db";
var testPass = "testpassphrase";

describe("Web interface.", function(){
    var browser;
    var crypti;

    before(function(done){
        browser = new Browser({
            testSuite : require('./test-suite.js')
        });

        // remove existing blockchains
        if (fs.exists(blockchainPath)) fs.unlinkSync(blockchainPath);

        crypti = spawn("nodejs", ["app.js","-b", blockchainPath, "-p", 7000], {stdio:"pipe"});

        [
            "passphrase",
            "account",
            "forging",
            "blockchain"
        ].forEach(function(section){
            var macros = require("./macros/" + section + ".js");
            Object.keys(macros).forEach(function(name){
                browser.addMacros(section + "." + name, macros[name]);
            });
        });

        setTimeout(done, 3000);
    });

    after(function(){
        crypti.kill();
        browser.exit();

        fs.unlinkSync(blockchainPath);
    });

    it("Should open and login", function(done){
        should(crypti).not.equal(null);
        should(crypti.killed).equal(false);

        browser.openTab()
            .resize({width:800, height:600})
            .goto("http://localhost:7000")
            .wait(2000)
            .until(10, function(){
                this
                    .hasElement('#enter')
                    .actions(function(value){
                        if (! value) return this.reload().wait(2000);
                    });
            })
            .render('./tmp/login.png')
            .macros("passphrase.login", testPass)
            .render("tmp/logged.png")
            .macros("account.view.check")
            // Check blockchain view
            .macros("blockchain.gotoFromMenu")
            .render("tmp/blockchain.png")
            .macros("blockchain.viewCheck")
            // Check forging view
            .macros("forging.gotoFromMenu")
            .render("tmp/forging.png")
            .macros("forging.viewCheck")
            .click("#logout")
            .wait()
            .macros("passphrase.viewCheck")
            .run(function(err, result){
                if (err) console.error(err.stack || err);

                should(err).equal(null);
                should(result).equal(true);
                done();
            });
    });
});