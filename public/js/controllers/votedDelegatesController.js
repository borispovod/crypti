require('angular');

angular.module('webApp').controller('votedDelegatesController', ['$scope', '$rootScope', '$http','peerFactory', "userService", "$interval", "$timeout", "$filter", "ngTableParams", "delegateService", "voteModal",
    function ($rootScope, $scope, $http, peerFactory, userService, $interval, $timeout, $filter, ngTableParams, delegateService, voteModal) {

        $scope.allVotes = 100
        * 1000
        * 1000
        * 1000
        * 1000
        * 100;

        $scope.count = 0;

        $scope.address = userService.address;
        $scope.loading = true;
        $scope.showVotes = false;

        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };

        $scope.voteList = {
            list: {toServer: [], toShow: []},
            inList: function (publicKey) {
                return this.list.toServer.indexOf('-' + publicKey) != -1;
            },
            vote: function (publicKey, username) {
                if (this.inList(publicKey)) {
                    this.list.toServer.splice(this.list.toServer.indexOf('-' + publicKey), 1);
                    this.list.toShow.splice(this.list.toShow.indexOf(username), 1);

                }
                else {
                    this.list.toServer.push('-' + publicKey);
                    this.list.toShow.push(username);
                }
                if (this.list.toServer.length == 0) {
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
                adding: false,
                destroy: function () {
                    $scope.voteList.list = {toServer: [], toShow: []};
                    $scope.unconfirmedTransactions.getList();
                }
            });
        };

        $scope.balance = userService._unconfirmedBalance;

        //Unconfirmed transactions
        $scope.unconfirmedTransactions = {
            list: [],
            getList: function () {
                $http.get(peerFactory.url + "/api/transactions/unconfirmed/", {params: {senderPublicKey: userService.publicKey}})
                    .then(function (response) {
                        $scope.unconfirmedTransactions.list = [];
                        response.data.transactions.forEach(function (transaction) {
                            $scope.unconfirmedTransactions.list = $scope.unconfirmedTransactions.list.concat(transaction.asset.votes);
                        });
                    });

            },
            inList: function (publicKey) {
                return this.list.indexOf('-' + publicKey) != -1;
            }
        };
        $scope.unconfirmedTransactions.getList();
        //end Unconfirmed transactions


        //My deletates
        $scope.tableMyDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 5,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [5, 10, 25],
            total: 0,
            getData: function ($defer, params) {
                delegateService.getMyDelegates($defer, params, $scope.filter, userService.address, function () {
                    $scope.count = params.total();
                    $scope.loading = false;
                    $timeout(function () {
                        $scope.unconfirmedTransactions.getList();
                    }, 1000);
                });
            }
        });

        $scope.tableMyDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableMyDelegates.reload();
        });

        $scope.updateMyDelegates = function () {
            $scope.tableMyDelegates.reload();
        };
        //end My delegates


        $scope.updateView = $interval(function () {
            delegateService.cachedVotedDelegates.time = delegateService.cachedVotedDelegates.time - 20000;
            $scope.updateMyDelegates();
        }, 1000 * 10);

        $scope.$on('$destroy', function () {
            $interval.cancel($scope.updateView);
            $scope.updateView = null;
        });
    }]);