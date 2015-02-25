var should = require('should');
var fs = require('fs');
var configHelpers = require('../../helpers/config.js');

describe("Config helper.", function(){
    describe("Function `saveSecret`.", function(){
        var pwd = process.cwd();
        var configPath = "config.json";
        var tmpDir = __dirname + "/../../tmp";
            
        before(function(){
            process.chdir(tmpDir);
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            fs.writeFileSync(configPath, JSON.stringify({
                forging : {}
            }));
        });

        after(function(){
            fs.unlinkSync(configPath);
            process.chdir(pwd);
        });

        it("Should be a function", function(){
            should(configHelpers.saveSecret).have.type("function");
        });

        it("Should save secret value to config", function(done){
            configHelpers.saveSecret("123", function(err){
                should(err).be.equal(null);
                var content = fs.readFileSync(configPath);
                var data = JSON.parse(content);
                should(data).be.an.Object.and.have.property("forging").be.an.Object.and.have.property("secret").equal("123");
                done();
            });
        });
    });
});

