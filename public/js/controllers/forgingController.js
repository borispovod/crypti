require('angular');


angular.module('webApp').controller('forgingController', ['$scope', '$rootScope', '$http', "userService", "$interval", "companyModal", "forgingModal", "registrationDelegateModal", "delegateService", "viewFactory", "blockInfo",
    function ($rootScope, $scope, $http, userService, $interval, companyModal, forgingModal, registrationDelegateModal, delegateService, viewFactory, blockInfo) {

        $scope.allVotes = 100
        * 1000
        * 1000
        * 1000
        * 1000
        * 100;

        $scope.graphs = {
            totalForged: {
                labels: ['Total Forged'],
                values: [1],
                colours: ['#90a4ae'],
                options: {
                    percentageInnerCutout: 90,
                    animationEasing: "linear",
                    segmentShowStroke: false,
                    showTooltips: false
                }
            },
            rank: {
                labels: ['Others', 'Rank'],
                values: [0, 100],
                colours: ['#90a4ae', '#f5f5f5'],
                options: {
                    percentageInnerCutout: 90,
                    animationEasing: "linear",
                    segmentShowStroke: false,
                    showTooltips: false
                }
            },
            uptime: {
                labels: ['Others', 'Uptime'],
                values: [0, 100],
                colours: ['#90a4ae', '#f5f5f5'],
                options: {
                    percentageInnerCutout: 90,
                    animationEasing: "linear",
                    segmentShowStroke: false,
                    showTooltips: false
                }
            },
            approval: {
                labels: ['Others', 'Approval'],
                values: [0, $scope.allVotes],
                colours: ['#90a4ae', '#f5f5f5'],
                options: {
                    percentageInnerCutout: 90,
                    animationEasing: "linear",
                    segmentShowStroke: false,
                    showTooltips: false
                }
            }
        }

        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };
        $scope.approval = 0;
        $scope.vote = 0;
        $scope.rank = 0;
        $scope.uptime = 0;
        $scope.view = viewFactory;
        $scope.view.page = {title: 'Forging', previos: null};
        $scope.address = userService.address;
        $scope.effectiveBalance = userService.effectiveBalance;
        $scope.totalBalance = userService.balance;
        $scope.unconfirmedBalance = userService.unconfirmedBalance;
        $scope.loadingBlocks = true;
        $scope.delegateInRegistration = userService.delegateInRegistration;

        $scope.getBlocks = function () {
            $http.get("/api/blocks", {
                params: {
                    generatorPublicKey: userService.publicKey,
                    limit: 20,
                    orderBy: "height:desc"
                }
            })
                .then(function (resp) {
                    $scope.blocks = resp.data.blocks;
                    $scope.loadingBlocks = false;
                });
        }

        $scope.getForgedAmount = function () {
            $http.get("/api/delegates/forging/getForgedByAccount", {params: {generatorPublicKey: userService.publicKey}})
                .then(function (resp) {
                    $scope.totalForged = resp.data.fees;
                    $scope.graphs.totalForged.values = [resp.data.fees || 1];
                });
        }

        $scope.getDelegate = function () {
            delegateService.getDelegate(userService.publicKey, function (response) {
                if ($scope.delegateInRegistration) {
                    $scope.delegateInRegistration = !(!!response);
                    userService.setDelegateProcess($scope.delegateInRegistration);
                }
                $scope.delegate = response;
                userService.setDelegate($scope.delegate);
                var totalDelegates = 108;
                var rank = response.rate;

                $scope.graphs.rank.values = [totalDelegates - rank, totalDelegates - 1 - (totalDelegates - rank)];
                if (($scope.rank == 0 && rank != 0) || ($scope.rank > 50 && rank <= 50) || ($scope.rank > 101 && rank <= 101) || ($scope.rank <= 50 && rank > 50)) {
                    $scope.graphs.rank.colours = [rank <= 50 ? '#7cb342' : (rank > 101 ? '#d32f2f' : '#ffa000'), '#f5f5f5'];
                }
                $scope.rank = rank;


                var uptime = parseFloat(response.productivity);

                $scope.graphs.uptime.values = [uptime, 100 - uptime];
                if (($scope.uptime == 0 && uptime > 0) || ($scope.uptime >= 95 && uptime < 95) || ($scope.uptime >= 50 && uptime < 50)) {
                    $scope.graphs.uptime.colours = [uptime >= 95 ? '#7cb342' : (uptime >= 50 ? '#ffa000' : '#d32f2f'), '#f5f5f5'];
                }
                $scope.uptime = response.productivity;


                var approval = $scope.getApproval(response.vote);

                $scope.graphs.approval.values = [approval, $scope.getApproval($scope.allVotes) - approval];
                if (($scope.approval == 0 && approval > 0) || ($scope.approval >= 95 && approval < 95) || ($scope.approval >= 50 && approval < 50)) {
                    $scope.graphs.approval.colours = [approval >= 95 ? '#7cb342' : (approval >= 50 ? '#ffa000' : '#d32f2f'), '#f5f5f5'];
                }
                $scope.approval = approval;

            });
        }

        $scope.getForging = function () {
            $http.get("/api/delegates/forging/status", {params: {publicKey: userService.publicKey}})
                .then(function (resp) {
                    $scope.forging = resp.data.enabled;
                    userService.setForging($scope.forging);
                });
        }

        $scope.infoInterval = $interval(function () {
            $scope.getBlocks();
            $scope.getForgedAmount();
            $scope.getDelegate();
            $scope.getForging();
        }, 1000 * 30);


        $scope.getBlocks();
        $scope.getForgedAmount();
        $scope.getDelegate();
        $scope.getForging();


        $scope.enableForging = function () {
            $scope.forgingModal = forgingModal.activate({
                forging: false,
                totalBalance: userService.unconfirmedBalance,
                destroy: function () {
                    $scope.forging = userService.forging;
                    $scope.getForging();
                }
            })
        }

        $scope.disableForging = function () {
            $scope.forgingModal = forgingModal.activate({
                forging: true,
                totalBalance: userService.unconfirmedBalance,
                destroy: function () {
                    $scope.forging = userService.forging;
                    $scope.getForging();
                }
            })
        }

        $scope.registrationDelegate = function () {
            $scope.registrationDelegateModal = registrationDelegateModal.activate({
                totalBalance: userService.unconfirmedBalance,
                destroy: function () {
                    $scope.delegateInRegistration = userService.delegateInRegistration;
                    $scope.getDelegate();
                }
            })
        }

        $scope.newCompany = function () {
            $scope.companyModal = companyModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                destroy: function () {
                    $scope.getInfo();
                }
            });
        }

        $scope.blockInfo = function (block) {
            $scope.modal = blockInfo.activate({block: block});
        }

    }]);