var should = require("should");
var sqliteHelper = require("../../helpers/dbLite.js");
var fs = require("fs");

var dbPath = __dirname + "/../../tmp/test.db";

describe("Sqlite helper.", function(){
    describe("Function `connect`.", function(){
        it("Should be a function", function(){
            should(sqliteHelper.connect).have.type("function");
        });

        before(function(){
           if (fs.existsSync(dbPath)) {
               fs.unlinkSync(dbPath);
           }
        });

        after(function(){
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
            }
        });

        it("Should to connect to db", function(done){
            sqliteHelper.connect(dbPath, function(err, db){
                should(err).match(function(it){
                    return typeof it === 'undefined' || null;
                });

                should(db).have.type("object").and.have.property("query").which.have.type("function");

                done();
            });
        });

    });

    describe("DB structure", function(){
        var db;
        before(function(done){
            sqliteHelper.connect(dbPath, function(err, _db){
                if (err) return done(err);

                db = _db;
                done();
            });
        });


        it("Should have `blocks` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='blocks';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `trs` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='trs';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `signatures` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='signatures';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `peers` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='peers';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `delegates` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='delegates';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `votes` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='votes';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `input` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='input';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });

        it("Should have `scripts` table", function(done){
            db.query("SELECT * FROM sqlite_master WHERE name='scripts';", function(err, result){
                should(err).equal(null);

                should(result).be.an.Array.and.have.length(1);
                done();
            });
        });
    });
});
