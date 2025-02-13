let sessionId = null;
let badgeCache;

let localizedBadges;
let localizedBadgesIgnoreUpdateTimer = null;

function initAccountControls() {
  document.getElementById('loginButton').onclick = () => {
    document.getElementById('loginErrorRow').classList.add('hidden');
    openModal('loginModal');
  };
  document.getElementById('logoutButton').onclick = () => {
    apiFetch('logout')
      .then(response => {
        if (!response.ok)
          console.log(response.statusText);
      }).catch(err => console.error(err));
    setCookie('sessionId', '');
    fetchAndUpdatePlayerInfo();
  };

  document.getElementById('loginForm').onsubmit = function () {
    const form = this;
    closeModal();
    apiFetch(`login?${new URLSearchParams(new FormData(form)).toString()}`)
      .then(response => {
        if (!response.ok) {
          response.text().then(_ => {
            document.getElementById('loginError').innerHTML = getMassagedLabel(localizedMessages.account.login.errors.invalidLogin, true);
            document.getElementById('loginErrorRow').classList.remove('hidden');
            openModal('loginModal');
          });
          return;
        }
        return response.text();
      }).then(sId => {
        if (sId) {
          setCookie('sessionId', sId);
          fetchAndUpdatePlayerInfo();
        }
      }).catch(err => console.error(err));
    return false;
  };

  document.getElementById('registerForm').onsubmit = function () {
    const form = this;
    if (document.getElementById('registerPassword').value !== document.getElementById('registerConfirmPassword').value) {
      document.getElementById('registerError').innerHTML = getMassagedLabel(localizedMessages.account.register.errors.confirmPasswordMismatch, true);
      document.getElementById('registerErrorRow').classList.remove('hidden');
      return false;
    }
    closeModal();
    apiFetch(`register?${new URLSearchParams(new FormData(form)).toString()}`)
      .then(response => {
        if (!response.ok) {
          response.text().then(error => {
            document.getElementById('registerError').innerHTML = getMassagedLabel(localizedMessages.account.register.errors[error === 'user exists' ? 'usernameTaken' : 'invalidCredentials'], true);
            document.getElementById('registerErrorRow').classList.remove('hidden');
            openModal('registerModal');
          });
          return;
        }
        document.getElementById('loginErrorRow').classList.add('hidden');
        openModal('loginModal');
      })
      .catch(err => console.error(err));
    return false;
  };

  document.getElementById('accountSettingsButton').onclick = () => {
    initAccountSettingsModal();
    openModal('accountSettingsModal', null, 'settingsModal');
  };

  const onClickBadgeButton = fromModal => {
    const badgeModalContent = document.querySelector('#badgesModal .modalContent');
    badgeModalContent.innerHTML = '';

    const updateBadgesAndOpenModal = () => {
      updateBadges(() => {
        let lastGame = null;
        const badgeCompareFunc = (a, b) => {
          if (a.game !== b.game) {
            if (a.game === gameId)
              return -1;
            if (b.game === gameId)
              return 1;
            return gameIds.indexOf(a.game) < gameIds.indexOf(b.game) ? -1 : 1;
          }
          return 0;
        };
        const badges = [{ badgeId: 'null', game: null}].concat(badgeCache.sort(badgeCompareFunc));
        for (let badge of badges) {
          if (badge.game !== lastGame) {
            const gameHeader = document.createElement('h2');
            gameHeader.classList.add('itemCategoryHeader');
            gameHeader.innerHTML = getMassagedLabel(localizedMessages.games[badge.game], true);
            badgeModalContent.appendChild(gameHeader);
            lastGame = badge.game;
          }
          const item = getBadgeItem(badge, true, true);
          if (badge.badgeId === (playerData?.badge || 'null'))
            item.children[0].classList.add('selected');
          if (!item.classList.contains('disabled')) {
            item.onclick = () => updatePlayerBadge(badge.badgeId, () => {
              initAccountSettingsModal();
              closeModal();
            });
          }
          badgeModalContent.appendChild(item);
        }

        openModal('badgesModal', null, fromModal ? 'accountSettingsModal' : null);
      });
    };
    if (!badgeCache.filter(b => !localizedBadges.hasOwnProperty(b.game) || !localizedBadges[b.game].hasOwnProperty(b.badgeId)).length || localizedBadgesIgnoreUpdateTimer)
      updateBadgesAndOpenModal();
    else
      updateLocalizedBadges(updateBadgesAndOpenModal);
  };

  document.getElementById('badgeButton').onclick = () => onClickBadgeButton(false);
  document.getElementById('accountBadgeButton').onclick = () => onClickBadgeButton(true);
}

function initAccountSettingsModal() {
  const badgeId = playerData?.badge || 'null';
  const badge = badgeCache.find(b => b.badgeId === badgeId);
  document.getElementById('accountBadgeButton').innerHTML = getBadgeItem(badge || { badgeId: 'null' }, false, true).innerHTML;
  document.getElementById('badgeButton').innerHTML = getBadgeItem(badge || { badgeId: 'null' }).innerHTML;
}

function getBadgeItem(badge, includeTooltip, scaled) {
  const badgeId = badge.badgeId;

  const item = document.createElement('div');
  item.classList.add('badgeItem');
  item.classList.add('item');
  item.classList.add('unselectable');

  const badgeContainer = document.createElement('div');
  badgeContainer.classList.add('badgeContainer');
  
  const badgeEl = (badge.unlocked || !badge.secret) && badgeId !== 'null' ? document.createElement('div') : null;

  if (badgeEl) {
    badgeEl.classList.add('badge');
    if (scaled)
      badgeEl.classList.add('scaledBadge');
    badgeEl.style.backgroundImage = `url('images/badge/${badgeId}.png')`;
  } else {
    if (badgeId !== 'null') {
      item.classList.add('disabled');
      badgeContainer.appendChild(getSvgIcon('locked', true));
      badgeContainer.appendChild(document.createElement('div'));
    } else
      badgeContainer.appendChild(getSvgIcon('ban', true));
  }

  if (badgeEl) {
    if (badge?.overlay) {
      const badgeOverlay = document.createElement('div');
      badgeOverlay.classList.add('badgeOverlay');
      badgeOverlay.setAttribute('style', `-webkit-mask-image: ${badgeEl.style.backgroundImage}; mask-image: ${badgeEl.style.backgroundImage};`);
      badgeEl.appendChild(badgeOverlay);
    }

    badgeContainer.appendChild(badgeEl);
    if (!badge.unlocked) {
      item.classList.add('disabled');
      badgeContainer.appendChild(getSvgIcon('locked', true));
    }
  }

  if (includeTooltip) {
    let tooltipContent = '';

    if (badgeId === 'null')
      tooltipContent = `<label>${localizedMessages.badges.null}</label>`;
    else {
      if (localizedBadges.hasOwnProperty(badge.game) && localizedBadges[badge.game].hasOwnProperty(badgeId)) {
        const localizedTooltip = localizedBadges[badge.game][badgeId];
        if (badge.unlocked || !badge.secret) {
          if (localizedTooltip.name)
            tooltipContent += `<h3 class="tooltipTitle">${getMassagedLabel(localizedTooltip.name, true)}</h3>`;
        } else
          tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        if (localizedTooltip.description)
          tooltipContent += `<div class="tooltipContent">${getMassagedLabel(localizedTooltip.description, true)}</div>`;
        tooltipContent += '<div class="tooltipSpacer"></div>';
        if (badge.mapId)
          tooltipContent += `<span class="tooltipLocation"><label>${getMassagedLabel(localizedMessages.badges.location, true)}</label><span class="tooltipLocationText">{LOCATION}</span></span>`;
        if ((badge.unlocked || !badge.secret) && localizedTooltip.condition) {
          if (badge.unlocked || !badge.secretCondition) {
            let condition = getMassagedLabel(localizedTooltip.condition, true);
            if (badge.seconds) {
              const minutes = Math.floor(badge.seconds / 60);
              const seconds = badge.seconds - minutes * 60;
              condition = condition.replace('{TIME}', localizedMessages.badges.time.replace('{MINUTES}', minutes.toString().padStart(2, '0')).replace('{SECONDS}', seconds.toString().padStart(2, '0')));
            }
            tooltipContent += `<div class="tooltipContent">${condition}</div>`;
          } else
            tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        }
      } else
        tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        
      tooltipContent += '<label class="tooltipFooter">';
      if (!badge.unlocked && badge.goalsTotal > 0)
        tooltipContent += `${getMassagedLabel(localizedMessages.badges.goalProgress).replace('{CURRENT}', badge.goals).replace('{TOTAL}', badge.goalsTotal)}<br>`;
      tooltipContent += `${getMassagedLabel(localizedMessages.badges.percentUnlocked).replace('{PERCENT}', Math.floor(badge.percent * 10) / 10)}</label>`;
        
      if (tooltipContent) {
        const baseTooltipContent = tooltipContent;

        const assignTooltip = () => addTooltip(item, tooltipContent, false, false, !!badge.mapId);

        if (badge.mapId) {
          const mapId = badge.mapId.toString().padStart(4, '0');
          const setTooltipLocation = () => {
            if (gameLocalizedMapLocations[badge.game] && gameLocalizedMapLocations[badge.game].hasOwnProperty(mapId))
              tooltipContent = baseTooltipContent.replace('{LOCATION}', getLocalizedMapLocationsHtml(badge.game, mapId, '0000', badge.mapX, badge.mapY, getInfoLabel("&nbsp;|&nbsp;")));
            else
              tooltipContent = baseTooltipContent.replace('{LOCATION}', getInfoLabel(getMassagedLabel(localizedMessages.location.unknownLocation)));
            assignTooltip();
          }
          if (gameLocalizedMapLocations.hasOwnProperty(badge.game))
            setTooltipLocation();
          else {
            tooltipContent = baseTooltipContent.replace('{LOCATION}', getInfoLabel(getMassagedLabel(localizedMessages.location.queryingLocation)));
            initLocations(globalConfig.lang, badge.game, setTooltipLocation);
          }
        } else
          assignTooltip();
      }
    }
  }

  item.appendChild(badgeContainer);

  return item;
}

function updateBadges(callback) {
  apiFetch(`badge?command=list`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      return response.json();
    })
    .then(badges => {
      badgeCache = badges.map(badge => {
        return { badgeId: badge.badgeId, game: badge.game, mapId: badge.mapId, mapX: badge.mapX, mapY: badge.mapY, seconds: badge.seconds, secret: badge.secret, secretCondition: badge.secretCondition, overlay: badge.overlay, percent: badge.percent, goals: badge.goals, goalsTotal: badge.goalsTotal, unlocked: badge.unlocked };
      });
      const newUnlockedBadges = badges.filter(b => b.newUnlock);
      for (let b = 0; b < newUnlockedBadges.length; b++)
        showAccountToastMessage('badgeUnlocked', 'info');
      if (callback)
        callback();
    })
    .catch(err => console.error(err));
}

function updatePlayerBadge(badgeId, callback) {
  apiFetch(`badge?command=set&id=${badgeId}`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      syncPlayerData(playerUuids[-1], playerData?.rank, playerData?.account, badgeId, -1);
      callback();
    })
    .catch(err => console.error(err));
}

function updateLocalizedBadges(callback) {
  if (localizedBadgesIgnoreUpdateTimer)
    clearInterval(localizedBadgesIgnoreUpdateTimer);
    
  fetch(`lang/badge/${globalConfig.lang}.json`)
    .then(response => response.json())
    .then(function (jsonResponse) {
      localizedBadges = jsonResponse;
      localizedBadgesIgnoreUpdateTimer = setTimeout(() => localizedBadgesIgnoreUpdateTimer = null, 300000);
      if (callback)
        callback(true);
    })
    .catch(err => console.error(err));
}

function showAccountToastMessage(key, icon, username) {
  if (!notificationConfig.account.all || (notificationConfig.account.hasOwnProperty(key) && !notificationConfig.account[key]))
    return;
  let message = getMassagedLabel(localizedMessages.toast.account[key], true).replace('{USER}', username);
  showToastMessage(message, icon, true);
}