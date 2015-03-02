require('angular');

angular.module('webApp').controller('delegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$timeout", "$filter", "ngTableParams", "delegateService", "voteModal",
    function ($rootScope, $scope, $http, userService, $interval, $timeout, $filter, ngTableParams, delegateService, voteModal) {

        $scope.allVotes = 100
        * 1000
        * 1000
        * 1000
        * 1000
        * 100;

        $scope.address = userService.address;

        $scope.showVotes = false;

        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };

        $scope.voteList = {
            list: {toServer: [], toShow: []},
            inList: function (publicKey) {
                return this.list.toServer.indexOf('+' + publicKey) != -1;
            },
            vote: function (publicKey, username) {
                if (this.inList(publicKey)) {
                    this.list.toServer.splice(this.list.toServer.indexOf('+' + publicKey), 1);
                    this.list.toShow.splice(this.list.toShow.indexOf(username), 1);

                }
                else {
                    this.list.toServer.push('+' + publicKey);
                    this.list.toShow.push(username);
                }
                if (this.list.toServer.length==0){
                    $scope.showVotes = false;
                }
            },
            toggle: function () {
                $scope.showVotes = !$scope.showVotes;
            }
        };

        $scope.vote = function (publicKey) {
            $scope.showVotes = false;
            $scope.voteModal = voteModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                voteList: $scope.voteList.list.toServer,
                destroy: function () {
                    $scope.voteList.list = {toServer: [], toShow: []};
                    $scope.delegates.getList(function () {
                        $scope.unconfirmedTransactions.getList();
                    });
                }
            });
        };

        $scope.balance = userService._unconfirmedBalance;

        //Unconfirmed transactions
        $scope.unconfirmedTransactions = {
            list: [],
            getList: function () {
                $http.get("/api/transactions/unconfirmed/", {params: {senderPublicKey: userService.publicKey}})
                    .then(function (response) {
                        $scope.unconfirmedTransactions.list = [];
                        response.data.transactions.forEach(function (transaction) {
                            $scope.unconfirmedTransactions.list = $scope.unconfirmedTransactions.list.concat(transaction.asset.votes);
                        });
                    });

            },
            inList: function (publicKey) {
                return this.list.indexOf('+' + publicKey) != -1;
            }
        };
        $scope.unconfirmedTransactions.getList();
        //end Unconfirmed transactions

        //Delegates exist
        $scope.delegates = {
            list: [],
            getList: function (cb) {
                $http.get("/api/accounts/delegates/", {params: {address: userService.address}})
                    .then(function (response) {
                        if (response.data.delegates == null) {
                            return [];
                        }
                        $scope.delegates.list = response.data.delegates.map(function (delegate) {
                            return delegate.publicKey;
                        });
                        cb();
                    });
            },
            voted: function (publicKey) {
                return this.list.indexOf(publicKey) != -1;
            }
        };
        $scope.delegates.getList(function () {
        });
        //end Delegates exist

        //Top deletates
        $scope.tableTopDelegates = new ngTableParams({
            page: 1,            // show first page
            count: delegateService.topRate,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [],
            total: delegateService.topRate,
            getData: function ($defer, params) {
                delegateService.getTopList($defer, params, $scope.filter, function () {
                    $timeout(function () {
                        $scope.delegates.getList(function () {
                            $scope.unconfirmedTransactions.getList();
                        });
                    }, 1);
                });
            }
        });

        $scope.tableTopDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableTopDelegates.reload();
        });

        $scope.updateTop = function () {
            $scope.tableTopDelegates.reload();
        };
        //end Top delegates

        //Standby delegates
        $scope.tableStandbyDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 10,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            total: 0,
            counts: [1, 10, 25],
            getData: function ($defer, params) {
                delegateService.getStandbyList($defer, params, $scope.filter, function () {
                    $timeout(function () {
                        $scope.unconfirmedTransactions.getList(function () {
                            $scope.delegates.getList();
                        });
                    }, 1);
                });
            }
        });

        $scope.tableStandbyDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableStandbyDelegates.reload();
        });

        $scope.updateStandby = function () {
            $scope.tableStandbyDelegates.reload();
        };
        //end Standby delegates

        $scope.updateView = $interval(function () {
            delegateService.cachedStundby.time = delegateService.cachedStundby.time - 20000;
            delegateService.cachedTOP.time = delegateService.cachedTOP.time - 20000;
            $scope.updateStandby();
            $scope.updateTop();
        }, 10000 * 1);


        $scope.$on('$destroy', function () {
            $interval.cancel($scope.updateView);
            $scope.updateView = null;
        });
    }]);