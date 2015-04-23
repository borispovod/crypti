require('angular');

angular.module('webApp').controller('appController', ['$scope', '$rootScope', '$http', "userService", "$interval", 'viewFactory', '$state', 'sendCryptiModal', 'serverSocket',
    function ($rootScope, $scope, $http, userService, $interval, viewFactory, $state, sendCryptiModal, serverSocket) {

        $scope.loading = {
            labels: ['Total', 'Loaded'],
            values: [100, 0],
            colours: ['#1976d2', '#ffffff'],
            options: {
                percentageInnerCutout: 90,
                animationEasing: "linear",
                segmentShowStroke: false,
                showTooltips: false
            }
        };
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

        $scope.getSync = function () {
            $http.get("/api/loader/status/sync").then(function (resp) {
                if (resp.data.success) {
                    $scope.sync = resp.data.sync ? (resp.data.height / resp.data.blocks) * 100 : resp.data.sync;
                    $scope.loading.values = [resp.data.height - resp.data.blocks, resp.data.blocks];
                }
            });
        }

        $scope.syncInterval = $interval(function () {
            $scope.getSync();
        }, 1000 * 10);

        $scope.getSync();

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

        $scope.$on('socket:hello', function (ev, data) {
            console.log('socket:hello', data);
        });
    }]);