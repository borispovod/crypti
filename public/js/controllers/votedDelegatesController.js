require('angular');

angular.module('webApp').controller('votedDelegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$timeout", "$filter", "ngTableParams", "delegateService", "voteModal", "viewFactory",
    function ($rootScope, $scope, $http, userService, $interval, $timeout, $filter, ngTableParams, delegateService, voteModal, viewFactory) {
        $scope.view = viewFactory;
        $scope.view.page = {title: 'Forging', previos: null};
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
            list: {},
            length: 0,
            recalcLength: function () {
                var size = 0, key;
                for (key in this.list) {
                    if (this.list.hasOwnProperty(key)) size++;
                }
                this.length = size;
            },
            inList: function (publicKey) {
                return !!this.list[publicKey];
            },
            vote: function (publicKey, username) {
                if (this.inList(publicKey)) {
                    delete this.list[publicKey];
                }
                else {
                    this.list[publicKey] = username;
                }
                this.recalcLength();
                if (this.list == {}) {
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
                voteList: $scope.voteList.list,
                adding: false,
                destroy: function () {
                    $scope.voteList.list = {};
                    $scope.unconfirmedTransactions.getList();
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
            counts: [],
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