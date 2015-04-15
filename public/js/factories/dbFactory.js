require('angular');
var LevelPouchDB = require('pouchdb');
var ip = require('ip');

angular.module('webApp').factory('dbFactory', function (peerFactory) {
    var factory = {};
    factory.randomList = [];
    factory.createdb = function () {
        this.db = new LevelPouchDB('cryptidb', {adapter: 'websql'});

    };

    factory.compact = function (cb) {
        this.db.compact().then(function (result) {
            cb(result);
        }).catch(function (err) {
           console.log(err);
        });
    };

    factory.emptydb = function (cb) {
        this.db.query(function (doc, emit) {
            if (doc._id != 'bestPeer' && doc._id != 'customPeer') {
                emit(doc);
            }
        }, function (err, results) {

            if (err) {
                return err;
            }
            cb(results.total_rows == 0);
        });

    };

    factory.getRandom = function (count, cb) {
        var key = (Math.floor((Math.random() * 10) + 1) - 1).toString();

        this.db.query(function (doc, emit) {
            if (doc._id.indexOf(key) != -1 && doc._id != 'bestPeer' && doc._id != 'customPeer') {
                emit(doc);
            }
        }, {limit: count}, function (err, results) {

            if (err) {
                return null;
            }
            if (factory.randomList.length >= 10) {
                cb();
            }
            else {
                factory.randomList = factory.randomList.concat(results.rows);
                factory.getRandom(count, cb);
            }
        });

    };

    factory.useBestPeer = function (use, cb) {
        if (use) {
            this.db.put({
                _id: 'bestPeer'
            }, function (err, response) {
                if (err) {
                    //return console.log(err);
                }
                cb();
            })
        }
        else {
            this.db.get('bestPeer', function (err, doc) {
                if (err) {
                    return cb();
                }
                factory.db.remove(doc, function (err, response) {
                    if (err) {
                        //return console.log(err);
                    }
                    cb();
                });
            });
        }
    };

    factory.isBestPeer = function (cb) {
        this.db.get('bestPeer', function (err, doc) {
            if (err) {
                return cb(false);
            }
            cb(true);
        })
    }
    ;

    factory.getCustom = function (cb) {
        this.db.query(function (doc, emit) {
            if (doc._id == 'customPeer') {
                emit(doc);
            }
        }, {limit: 1}, function (err, results) {

            if (err) {
                return err;
            }
            cb(results)
        });
    };

    factory.updatedb = function (cb) {
        this.db.query(function (doc, emit) {
            if (doc.needtocheck && doc._id != 'bestPeer' && doc._id != 'customPeer') {
                emit(doc);
            }
        }, {limit: 2}, function (err, results) {
            if (err) {
                return err;
            }
            if (results.total_rows === 0) {
                factory.db.allDocs({
                    include_docs: true
                }, function (err, response) {
                    if (err) {
                        return err;
                    }
                    response.rows.forEach(function (peer) {
                        if (peer.doc._id != 'customPeer' && peer.doc._id != 'bestPeer') {
                            factory.db.get(peer.doc._id, function (err, doc) {
                                if (err) {
                                    return  err;
                                }
                                factory.db.put({
                                    port: peer.doc.port,
                                    url: "http://" + ip.fromLong(peer.doc._id) + ":" + peer.doc.port + "",
                                    needtocheck: true,
                                    custom: false
                                }, peer.doc._id, doc._rev, function (err, response) {
                                    if (err) {
                                        return err;
                                    }
                                });
                            });
                        }
                    });
                    cb(results.rows);
                });
            }
            else {
                cb(results.rows);
            }


        });
    };


    factory.add = function (peer) {
        this.db.put({
            _id: peer.ip,
            port: peer.port,
            url: "http://" + ip.fromLong(peer.ip) + ":" + peer.port + "",
            needtocheck: true,
            custom: false
        }, function (err, response) {
            if (err) {
                //return console.log(err);
            }
           // console.log(response);
        })
    };

    factory.saveCustomPeer = function (peer, cb) {
        if (peer == undefined || peer.trim() == '') {
            factory.db.get('customPeer', function (err, doc) {
                if (err) {

                }
                factory.db.remove(doc, function (err, response) {
                    if (err) {
                        //return console.log(err);
                    }
                    cb('');
                });
            });
        }
        else {
            this.db.get('customPeer', function (err, doc) {
                if (err) {
                    factory.db.put({
                        _id: 'customPeer',
                        url: "http://" + peer + "",
                        ip: peer.split(":")[0],
                        port: peer.split(":")[1] == undefined ? '' : peer.split(":")[1]
                    }, function (err, response) {
                        if (err) {
                            //return console.log(err);
                        }
                        //console.log(response);
                        cb(peer);
                    })
                }
                else {
                    factory.db.put({
                        url: "http://" + peer + "",
                        ip: peer.split(":")[0],
                        port: peer.split(":")[1] == undefined ? '' : peer.split(":")[1]
                    }, 'customPeer', doc._rev, function (err, response) {
                        if (err) {

                        }
                        cb(peer)
                    });
                }
            });

        }
    };


    factory.updatepeer = function (peer) {
        this.db.get(peer.key._id, function (err, doc) {
            if (err) {
                return err;
            }
            factory.db.put({
                port: peer.key.port,
                url: "http://" + ip.fromLong(peer.key._id) + ":" + peer.key.port + "",
                needtocheck: false,
                custom: false
            }, peer.key._id, doc._rev, function (err, response) {
                if (err) {
                    return (err);
                }
            });
        });
    };

    factory.delete = function (ip, cb) {
        this.db.get(ip, function (err, doc) {
            if (err) {
                return (err);
            }
            factory.db.remove(doc, function (err, response) {
                if (err) {
                    return (err);
                }
                var newRandomList = [];
                factory.randomList.forEach(function (peer) {
                    if (peer.id != ip) {
                        newRandomList.push(peer);
                    }

                });
                factory.randomList = newRandomList;
                factory.getRandom(10, cb);
            });
        });
    };

    factory.destroydb = function () {
        this.db.destroy(function (error) {
            if (error) {
                return (error);
            } else {

            }
        });
    }


    return factory;
})
;
