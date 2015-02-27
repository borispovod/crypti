require('angular');

angular.module('webApp').controller('votedDelegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", "delegateService", "voteModal",
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
                        $scope.unconfirmedTransactions.list = response.data.transactions;
                        console.log($scope.unconfirmedTransactions.list, response);
                    });
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
                        $scope.delegates.list = response.data.delegates;
                        console.log($scope.delegates.list);
                    });
            },
            voted: function(publicKey) {
                return this.list.indexOf(publicKey) != -1;
            }
        };
        $scope.delegates.getList();
        //end Delegates exist

        //Top deletates
        $scope.tableTopDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 101,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [], // hide page counts control
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


        $scope.updateView = $interval(function () {
            $scope.updateStandby();
            $scope.updateTop();
            $scope.unconfirmedTransactions.getList();
            $scope.delegates.getList();
        }, 10000 * 1);

    }]);