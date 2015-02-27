require('angular');

angular.module('webApp').controller('delegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", "delegateService", "voteModal",
    function ($rootScope, $scope, $http, userService, $interval, $filter, ngTableParams, delegateService, voteModal) {

        $scope.allVotes = 100 * 1000 * 1000;

        $scope.address = userService.address;


        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };

        $scope.voteList = {
            list: [],
            inList: function (publicKey) {
                return this.list.indexOf('+' + publicKey) != -1;
            },
            vote: function (publicKey) {
                if (this.inList(publicKey)) {
                    this.list.splice('+' + this.list.indexOf(publicKey), 1);
                }
                else {
                    this.list.push('+' + publicKey);
                }
            }
        };

        $scope.vote = function (publicKey) {
            $scope.voteModal = voteModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                voteList: $scope.voteList.list,
                destroy: function () {
                    $scope.voteList.list = [];
                    $scope.unconfirmedTransactions.getList();
                    $scope.delegates.getList();
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
            getList: function () {
                $http.get("/api/accounts/delegates/", {params: {address: userService.address}})
                    .then(function (response) {
                        if (response.data.delegates == null) {
                            return [];
                        }
                        $scope.delegates.list = response.data.delegates.map(function (delegate) {
                            return delegate.publicKey;
                        });
                    });
            },
            voted: function (publicKey) {
                return this.list.indexOf(publicKey) != -1;
            }
        };
        $scope.delegates.getList();
        //end Delegates exist

        //Top deletates
        $scope.tableTopDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 3,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [],
            total: 3,
            getData: function ($defer, params) {
                delegateService.getTopList($defer, params, $scope.filter);
            }
        });

        $scope.tableTopDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableTopDelegates.reload();
        });

        $scope.updateTop = function () {
            if (new Date() - delegateService.cachedTOP.time >= 1000 * 10) {
                $scope.tableTopDelegates.reload();
            }
        };
        //end Top delegates

        //Standby delegates
        $scope.tableStandbyDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 3,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            total: 0,
            counts: [1, 3, 25],
            getData: function ($defer, params) {
                delegateService.getStandbyList($defer, params, $scope.filter);
            }
        });

        $scope.tableStandbyDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableStandbyDelegates.reload();
        });

        $scope.updateStandby = function () {
            if (new Date() - delegateService.cachedStundby.time >= 1000 * 10) {
                $scope.tableStandbyDelegates.reload();
            }
        };
        //end Standby delegates

        $scope.updateView = $interval(function () {
            $scope.updateStandby();
            $scope.updateTop();
            $scope.unconfirmedTransactions.getList();
            $scope.delegates.getList();
        }, 10000 * 1);

    }]);