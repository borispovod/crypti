require('angular');
var LevelPouchDB = require('pouchdb');

angular.module('webApp').factory('dbFactory', function () {
    var factory = {};
    factory.createdb = function () {
        factory.db = new LevelPouchDB('cryptidb', {adapter: 'websql'});
        factory.db.put({
            _id: 'peer'+new Date(),
            title: 'Heroes'
        }, function (err, response) {
            if (err) {
                return console.log(err);
            }
            factory.db.allDocs({
                include_docs: true
            }, function (err, response) {
                if (err) {
                    return console.log(err);
                }
                debugger;
                console.log(response);
            });
        });

    }
    return factory;
});
