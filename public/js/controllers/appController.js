require('angular');

angular.module('webApp').controller('appController', ['$scope', '$rootScope', '$http', "userService", "$interval", 'viewFactory', '$state', 'sendCryptiModal',
    function ($rootScope, $scope, $http, userService, $interval, viewFactory, $state, sendCryptiModal) {
        $scope.view = viewFactory;
        $scope.appUser = userService;
        $scope.modules = [
            'main.dashboard',
            'main.delegates',
            'main.transactions',
            'main.votes',
            'main.forging',
            'main.blockchain',
            'passphrase'

        ];

        $scope.sendCrypti = function () {
            $scope.sendCryptiModal = sendCryptiModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                destroy: function () {
                }
            });
        }

        $scope.showMenuItem = function (state) {
            return $scope.modules.indexOf(state) != -1;
        }
        $scope.goToPrevios = function () {
            $state.go($scope.view.page.previos);
        }
        $rootScope.$on('$stateChangeSuccess',
            function (event, toState, toParams, fromState, fromParams) {

            });
        $rootScope.$on('$stateChangeStart',
            function (event, toState, toParams, fromState, fromParams) {

            });
    }]);