import shortid from 'shortid';
import io from 'socket.io-client';
import localForage from 'localforage';
import {renderDateSection, renderMessage, messageToDOM} from './render';
import {formatDate, groupMessagesByDate} from './utils';

// Register service worker
if ('serviceWorker' in navigator) {
  // Where to find the service worker
  navigator.serviceWorker.register('/sw.js');
}

localForage.getItem('messages', init);

function init(error, messages) {
  messages = messages || [];

  if (error) {
    console.error(error); // eslint-disable-line no-console
  }

  // Sort messages by date
  messages = messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  // Add message saved in localStorage to DOM
  initializeMessagesWindow(messages);

  // Connect to server via socket
  const socket = io.connect();

  // React to events from server
  socket.on('message', onReceiveMessageFromServer);
  socket.on('messageReceived', addReceivedStatusToMessage);
  socket.on('displayResults', displayResults);

  // Handle form submits
  document.querySelector('form').addEventListener('submit', e => submitMessage(e, socket));
}

/**
 * Initializes the messages window with date grouped messages
 * @param  {Array} messages Saved messages
 */
function initializeMessagesWindow(messages) {
  updateStatus();

  const groupedMessages = groupMessagesByDate(messages);

  const dates = Object.keys(groupedMessages);
  const today = formatDate(new Date());
  let html = '';

  if (dates.length > 0) {
    html = dates
    .map(date =>
      renderDateSection(
        date,
        groupedMessages[date]
          .map(message => renderMessage(message, true))
          .reduce((html, str) => (html += str))
      )
    )
    .reduce((html, str) => (html += str));

    // Add today section if last saved date section isn't today
    if (dates[dates.length - 1] !== today) {
      html += renderDateSection(today);
    }
  } else { // Add default 'today' list section when localStorage is empty
    html = renderDateSection(today);
  }

  const chatWindow = document.getElementById('messages');

  chatWindow.innerHTML = html;

  scrollMessages();
}

function onReceiveMessageFromServer(message) {
  updateStatus();
  saveMessage(message);
  messageToDOM(message);
  scrollMessages();
  hideLoader();
}

/**
 * Saves message to localStorage messages array
 * @param  {Object} message The message to save
 */
function saveMessage(message) {
  localForage.getItem('messages', onMessagesLoaded);
  function onMessagesLoaded(error, messages) {
    messages = messages || [];
    if (error) {
      console.error(error); // eslint-disable-line no-console
    }

    localForage.setItem('messages', [...messages, message]);
  }
}

/**
 * Submits form event value to the server over a socket
 * @param  {Object} event form submit event
 * @param  {Object} socket currently connected socket
 */
function submitMessage(event, socket) {
  updateStatus();
  const messageForm = document.querySelector('form');
  const value = messageForm.querySelector('input[name="message"]').value;

  if (value.length > 0) {
    const message = {
      value,
      id: shortid.generate(),
      timestamp: new Date(),
    };

    // Send message to the server
    socket.emit('message', message);

    messageToDOM(message);

    saveMessage(message);

    scrollMessages();

    // Clear message form input
    messageForm.querySelector('input[name="message"]').value = '';
  }

  event.preventDefault();
}

/**
 * Update the online indicator
 */
function updateStatus() {
  // Select the indicator element
  const indicator = document.querySelector('[data-tooltip]');
  if(navigator.onLine) {
    indicator.setAttribute('data-tooltip', 'online');
  } else {
    indicator.setAttribute('data-tooltip', 'offline');
  }
}

/**
 * Scrolls the message window to the last item
 */
function scrollMessages() {
  const chatWindow = document.getElementById('messages');
  chatWindow.parentNode.scrollTop = chatWindow.parentNode.scrollHeight;
}

/**
 * Add received icon to specific message
 * @param {String} id ID of message to add icon to
 */
function addReceivedStatusToMessage({id}) {
  document.querySelector('[data-id="' + id + '"]').setAttribute('data-read', true);
  showLoader();
}

/**
 * Hides the typing indicator
 */
function hideLoader() {
  document.querySelector('#loader').classList.add('hide');
}
/**
 * Show the typing indicator
 */
function showLoader() {
  document.querySelector('#loader').classList.remove('hide');
  scrollMessages();
}

/**
 * render search results to dom
 * @param  {Array} results objects from the search query
 */
function displayResults(results) {
  if (Array.isArray(results) === false) {
    results = [results];
  }

  // Step 1: clean the api results
  const cleanResults = results.map(function(currentValue) {

    let author = '';

    if (currentValue.authors) {
      const authors = currentValue.authors.author || currentValue.authors['main-author'];
      author = Array.isArray(authors) ?
        authors
          .map(val => val['search-term'])
          .reduce((acc, val) => acc += ' & ' + val) :
        authors['search-term'];
    }

    const title = currentValue.titles['short-title'];

    return {
      link: currentValue['detail-page'],
      image: currentValue.coverimages.coverimage[1] || 'https://v19.nbc.bibliotheek.nl/thumbnail?uri=http://data.bibliotheek.nl/ggc/ppn/365747343&token=c1322402',
      title: title.length > 26 ? title.substring(0, 26) + '...' : title,
      author: author,
    };
  });

  // Step 2: create HTML String
  const htmlString =
    '<ol class="results">' +
      cleanResults
        .map(function (currentValue) {
          return `
            <li>
              <a href="${currentValue.link}">
                <div>
                  <h2>${currentValue.title}</h2>
                  <h3>${currentValue.author}</h3>
                </div>
                <img src="${currentValue.image}" alt="${currentValue.title}">
              </a>
            </li>
          `;
        })
        .reduce(function (acc, currentValue) {
          return acc + currentValue;
        }) +
    '</ol>';

  const message = {
    id: -1,
    value: htmlString,
    timestamp: new Date(),
  };

  // Step 3: Insert HTML string into DOM
  // const chatField = document.querySelector('#messages li:last-of-type');
  // chatField.innerHTML += htmlString;
  saveMessage(message);
  messageToDOM(message);
  scrollMessages();
}
