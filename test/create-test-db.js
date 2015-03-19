
var faker = require('faker');
var dbHelper = require('../helpers/dbLite.js');
var async = require('async');
//var fs = require('fs');
var squel = require('squel');

var dbPath = process.argv[2] || 'tmp/blockchain.db';

console.time('insert 1000 row');
dbHelper.connect(dbPath, function(err, dblite){
    if (err) {
        console.error(err);
        process.exit(1);
    }


    var index = {};
    var count;
    var total;

    async.parallel([
        function(done) {
            // Count items
            dblite.query('SELECT COUNT(*) FROM dapps;', function(err, rows) {
                if (err) return done(err);

                count = parseInt(rows[0][0]);
                total = count + 1000;
                done();
            });
        },
        function(done){
            dblite.query('SELECT name, url FROM dapps;', function(err, rows){
                if (err) return done(err);

                rows.forEach(function(row){
                    index[row[0]] = true;
                    index[row[1]] = true;
                });

                done();
            });
        }
    ], function(err){
        if (err) {
            console.error(err);
            process.exit(1);
        }

        async.whilst(
            function() {
                console.log('Rows %s', count);

                return count < total;
            },
            function (done) {
                var rows = [];
                var query = squel.insert().into('dapps');
                var item;

                while(rows.length < 100) {
                    item = {
                        name : faker.company.companyName(),
                        description : faker.company.catchPhrase(),
                        url : 'https://' +  faker.internet.domainName()
                    };

                    if (item.name in index === false && item.url in index === false) {
                        index[item.name] = true;
                        index[item.url] = true;
                        rows.push(item);
                    }
                }

                query.setFieldsRows(rows);
                var param = query.toParam();
                dblite.query(param.text, param.values, function(err){
                    if (err) return done(err);

                    dblite.query('SELECT COUNT(*) FROM dapps;', function(err, rows){
                        if (err) return done(err);

                        count = parseInt(rows[0][0]);
                        done();
                    });
                });
            },
            function(err){
                if (err) {
                    console.error(err);
                    process.exit(1);
                }

                console.timeEnd('insert 1000 row');
                dblite.close();
            }
        );
    });
});

