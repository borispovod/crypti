require('angular');

angular.module('webApp').controller('forgingController', ['$scope', '$rootScope', '$http', 'peerFactory', "userService", "$interval", "companyModal", "registrationDelegateModal", "delegateService",
    function ($rootScope, $scope, $http, peerFactory, userService, $interval, companyModal, registrationDelegateModal, delegateService) {
        $scope.address = userService.address;
        $scope.effectiveBalance = userService.effectiveBalance;
        $scope.totalBalance = userService.balance;
        $scope.unconfirmedBalance = userService.unconfirmedBalance;
        $scope.loadingBlocks = true;
        $scope.delegateInRegistration = userService.delegateInRegistration;

        $scope.getBlocks = function () {
            $http.get(peerFactory.getUrl() + "/api/blocks", {
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
            $http.get(peerFactory.getUrl() + "/api/delegates/forging/getForgedByAccount", {params: {generatorPublicKey: userService.publicKey}})
                .then(function (resp) {
                    $scope.totalForged = resp.data.fees;
                });
        }


        $scope.infoInterval = $interval(function () {
            $scope.getBlocks();
            $scope.getForgedAmount();
        }, 1000 * 30);


        $scope.getBlocks();
        $scope.getForgedAmount();
    }]);
