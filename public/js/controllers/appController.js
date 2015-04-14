require('angular');

angular.module('webApp').controller("appController", ["$scope", '$rootScope', "$http", "$interval", "$window", "peerFactory", "dbFactory", "stBlurredDialog",
    function ($scope, $rootScope, $http, $interval, $window, peerFactory, dbFactory, stBlurredDialog) {
        $scope.inError = false;

        $scope.dbCompact = $interval(function () {
            dbFactory.compact(function (resp) {
            });
        }, 5 * 6 * 10 * 1000);

        $scope.$on('start-interval', function (event, args) {
            $scope.peerCheking = $interval(function () {
                $scope.checkPeer()
            }, 10000);
        });

        $scope.checkPeer = function () {
            peerFactory.checkPeer(peerFactory.getUrl(), function (resp) {
                if (resp.status != 200) {
                    if ($scope.inError) {
                        dbFactory.getCustom(function (response) {
                            if (response.total_rows === 0) {
                                var setBestPeer = function () {
                                    dbFactory.emptydb(function (empty) {
                                        if (empty) {
                                            console.log('empty peer list');
                                        }
                                        else {
                                            dbFactory.getRandom(10, function () {
                                                var key = (Math.floor((Math.random() * 10) + 1) - 1);
                                                peerFactory.checkPeer(dbFactory.randomList[key].key.url, function (resp) {
                                                    if (resp.status == 200) {
                                                        peerFactory.setPeer(ip.fromLong(dbFactory.randomList[key].key._id), dbFactory.randomList[key].key.port);
                                                        $scope.peerexists = true;

                                                    }
                                                    else {
                                                        dbFactory.delete(dbFactory.randomList[key].key._id, function () {
                                                            setBestPeer();
                                                        });
                                                    }

                                                })
                                            });
                                        }
                                    });
                                }
                            }
                            else {
                                $interval.cancel($scope.peerCheking);
                                stBlurredDialog.open('partials/modals/blurredModal.html', {
                                    err: true,
                                    disconnect: true
                                });

                            }
                        });

                    }
                    else {
                        $scope.inError = true;
                    }
                }
                else {
                    $scope.inError = false;
                }
            });
        };

        $scope.peerCheking = $interval(function () {
            $scope.checkPeer()
        }, 10000);

        $scope.$on('$destroy', function () {
            $interval.cancel($scope.peerCheking);
            $interval.cancel($scope.dbCompact);
        });
    }]);