require('angular');

angular.module('webApp').factory('sendCryptiModal', function (btfModal) {
    return btfModal({
        controller: 'sendCryptiController',
        templateUrl: 'public/partials/modals/sendCrypti.html'
    });
});