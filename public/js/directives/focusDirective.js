require('angular');

angular.module('webApp').directive('setFocus', function () {
    return {
        scope: {
            setFocus: '='
        },
        link: function ($scope, $element) {
            $scope.$watch('setFocus', function (focus) {
                if (focus) {
                    $element[0].focus();
                }
            });

        }
    };
})
