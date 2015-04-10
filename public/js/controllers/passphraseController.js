require('angular');
var ip = require('ip');
var ipRegex = require('ip-regex');

angular.module('webApp').controller('passphraseController',
    ['$scope', '$rootScope', '$http', "$state", '$interval', '$location', "userService", "dbFactory", "peerFactory", "transactionService", 'stBlurredDialog',
        function ($rootScope, $scope, $http, $state, $interval, $location, userService, dbFactory, peerFactory, transactionService, stBlurredDialog) {
            $scope.peerexists = false;
            $scope.editingPeer = false;
            $scope.custom = false;
            $scope.addressError = false;
            $scope.errorMessage = "";

            $scope.peerSettings = function () {
                $scope.editingPeer = !$scope.editingPeer;
            };
            $scope.savePeerSettings = function (custom, best) {
                custom = custom || '';
                $scope.addressError = false;
                var isIP = ipRegex({exact: true}).test(custom.split(":")[0]);
                var isPort = (parseInt(custom.split(":")[1]) > 0 && parseInt(custom.split(":")[1]) <= 61000);
                $scope.addressError = (!isIP || !isPort) && custom !='';
                if ($scope.addressError) {
                    dbFactory.saveCustomPeer(undefined, function (peer) {

                    })
                    return;
                }
                $scope.editingPeer = false;
                dbFactory.useBestPeer(best, function () {
                    $scope.bestPeer = best;
                    dbFactory.saveCustomPeer(custom, function (customPeer) {
                        $scope.customPeer = customPeer;
                        if (!$scope.bestPeer && $scope.customPeer!='') {
                            $scope.custom = true;
                            peerFactory.setPeer(custom.split(":")[0],
                                custom.split(":")[1] == undefined ? '' : custom.split(":")[1]);
                        }
                        else {
                            stBlurredDialog.open('partials/modals/blurredModal.html', {err: false});
                            $scope.setBestPeer();
                        }
                    })
                });
            };
            // angular.element(document.getElementById("forgingButton")).show();
            $scope.getPeers = function (url, cb) {
                peerFactory.peerList.forEach(function (peer) {
                    peerFactory.setPeer(peer.ip, peer.port);
                    dbFactory.add({ip: ip.toLong(peer.ip).toString(), port: peer.port});
                    $http.get(peerFactory.getUrl() + "/peer/list", transactionService.createHeaders())
                        .then(function (resp) {
                            //console.log(resp);
                            resp.data.peers.forEach(function (peer) {
                                if (peer.sharePort) {
                                    dbFactory.add(peer);
                                }
                            });
                            cb();
                        });
                });
            }

            $scope.setBestPeer = function () {
                dbFactory.emptydb(function (empty) {
                    if (empty) {
                        console.log('empty peer list');
                    }
                    else {
                        dbFactory.getRandom(10, function () {
                            var key = (Math.floor((Math.random() * 10) + 1) - 1);
                            // console.log(dbFactory.randomList);
                            peerFactory.checkPeer(dbFactory.randomList[key].key.url, function (resp) {
                                if (resp.status == 200) {
                                    peerFactory.setPeer(ip.fromLong(dbFactory.randomList[key].key._id), dbFactory.randomList[key].key.port);
                                    console.log('newPeer', ip.fromLong(dbFactory.randomList[key].key._id));
                                    $scope.peerexists = true;
                                    stBlurredDialog.close();
                                }
                                else {
                                    console.log('errorPeer', ip.fromLong(dbFactory.randomList[key].key._id), resp);
                                    dbFactory.delete(dbFactory.randomList[key].key._id, function () {
                                        $scope.setBestPeer();
                                    });
                                }

                            })
                        });
                    }
                });

            }

            $scope.login = function (pass) {
                if ($scope.peerexists) {
                    if ($scope.custom) {
                        peerFactory.checkPeer(peerFactory.getUrl(), function (resp) {
                            if (resp.status == 200) {
                                var data = {secret: pass};
                                if (!pass || pass.length > 100) {
                                    $scope.errorMessage = "Please enter your password.";
                                }
                                else {
                                    var crypti = require('crypti-js');
                                    var keys = crypti.crypto.getKeys(pass);
                                    var address = crypti.crypto.getAddress(keys.publicKey);
                                    userService.setData(address, keys.publicKey);
                                    $state.go('main.account');
                                }
                            }
                            else {
                                stBlurredDialog.open('partials/modals/blurredModal.html', {err: true});
                            }

                        })
                    }
                    else {
                        var data = {secret: pass};
                        if (!pass || pass.length > 100) {
                            $scope.errorMessage = "Please enter your password.";
                        }
                        else {
                            var crypti = require('crypti-js');
                            var keys = crypti.crypto.getKeys(pass);
                            var address = crypti.crypto.getAddress(keys.publicKey);
                            userService.setData(address, keys.publicKey);
                            $state.go('main.account');
                        }
                    }

                }
            }
            //runtime


            $scope.ubpatedbinterval = $interval(function () {
                dbFactory.updatedb(function (response) {
                    response.forEach(function (peer) {
                        peerFactory.checkPeer(
                            peer.key.url,
                            function (resp) {
                                if (resp.status == 200) {
                                    console.log('workingPeer', ip.fromLong(peer.key._id), resp);
                                    resp.data.peers.forEach(function (peer) {
                                        if (peer.sharePort) {
                                            dbFactory.add(peer);
                                        }
                                    });
                                    dbFactory.updatepeer(peer);
                                }
                                else {
                                    console.log('errorPeer', ip.fromLong(peer.key._id), resp);
                                    dbFactory.delete(peer.key._id,
                                        function () {

                                        });

                                }
                            })
                    })
                });
            }, 1000 * 60 * 1);


            dbFactory.createdb();

            dbFactory.emptydb(
                function (empty) {

                    if (empty) {
                        stBlurredDialog.open('partials/modals/blurredModal.html', {err: false});
                        $scope.getPeers(peerFactory.getUrl(), function () {
                            $scope.setBestPeer();
                        });
                    } else {
                        dbFactory.isBestPeer(function (best) {
                                $scope.bestPeer = best;
                                if (best) {
                                    stBlurredDialog.open('partials/modals/blurredModal.html', {err: false});
                                    dbFactory.getCustom(function (response) {
                                        if (response.total_rows === 0) {

                                        }
                                        else {
                                            $scope.customPeer = response.rows[0].key.ip + ':' + response.rows[0].key.port;

                                        }
                                    });
                                    $scope.setBestPeer();
                                }
                                else {
                                    dbFactory.getCustom(function (response) {
                                        if (response.total_rows === 0) {
                                            $scope.setBestPeer();
                                        }
                                        else {
                                            $scope.peerexists = true;
                                            console.log('custom peer');
                                            $scope.custom = true;
                                            $scope.customPeer = response.rows[0].key.ip + ':' + response.rows[0].key.port;
                                            peerFactory.setPeer(response.rows[0].key.ip, response.rows[0].key.port);

                                        }
                                    });
                                }
                            }
                        );


                    }
                }
            );
        }
    ])
;


