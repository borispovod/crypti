require('angular');

angular.module('webApp').controller('appController', ['$scope', '$rootScope', '$http', "userService", "$interval", 'viewFactory', '$state',
    function ($rootScope, $scope, $http, userService, $interval, viewFactory, $state) {
        $scope.view = viewFactory;

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