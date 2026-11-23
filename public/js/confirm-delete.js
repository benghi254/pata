// Ask before deleting a listing.
document.querySelectorAll('form.confirm-delete').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    if (!window.confirm('Delete "' + form.dataset.name + '"? This cannot be undone.')) e.preventDefault();
  });
});

// Ask before leaving a shop you work at.
document.querySelectorAll('form.confirm-leave').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    if (!window.confirm('Leave "' + form.dataset.name + '"? You will need a new invite to come back.')) e.preventDefault();
  });
});
