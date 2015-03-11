require('angular');

angular.module('webApp').factory('secondPassphraseModal', function (btfModal) {
    return btfModal({
        controller: 'secondPassphraseModalController',
        templateUrl: 'public/partials/modals/secondPassphraseModal.html'
    });
});