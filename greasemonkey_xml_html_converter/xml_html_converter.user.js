// ==UserScript==
// @name			Content Symphony Embedded XML to HTML Converter
// @namespace		http://amazon.com
// @description 	This script will allow conversion from XML to HTML and back within Content Symphony.
// @include 		https://content-symphony-na.amazon.com/mn/*
// @require			http://code.jquery.com/jquery-latest.min.js
// @author			Patrick Costanzo (pcosta@)
// $Revision: #2 $
// ==/UserScript==



$(document).ready(function(){

// Append two radio buttons to the body in CS edit pages.

// This is currently displaying twice (since there is an iframe on the page). The ID of the body of the iframe is #viewport1, but appending to 'body #viewport1' isn't working for whatever reason. Either way, the buttons still work and it's not a deal breaker for me :).

$('<div id="convertContainer"><input type="radio" name="radio" value="outTB" checked>XML<br><input type="radio" name="radio" value="inTB">HTML</div>').appendTo('body').css({
	'position':'absolute',
	'z-index':999,
	'top':'10px',
});


// Listen to the radio buttons to see if anything has changed, depending upon which one is checked after a change happens, this will execute a function to conver the xml in the appropriate direction.

$("input[name='radio']").change(function(){

	if ($("input[value='inTB']").is(':checked')){

		convertXML();
	}

	if ($("input[value='outTB']").is(':checked')){

    convertHTML();
	}

});


// Conversion functions, element id for the textarea in CS is 'ext-gen37'. Store the existing content in a string, do the join/splitting and then save to a new string and set the textarea value to the new string.

function convertXML() {
  var origString = document.getElementById('ext-gen37').value;

  var newString = origString.split("&lt;");
  newString = newString.join("<");
  newString = newString.split("&gt;");
  newString = newString.join(">");
  newString = newString.split("&amp;");
  newString = newString.join("&");
  newString = newString.split("&amp;");
  newString = newString.join("&");
  newString = newString.split("<\?xml version=\"1.0\" encoding=\"UTF-8\"?><dynamic-widget name=\"apparel-storefront-widget\">");
  newString = newString.join("");
  newString = newString.split("<arg name=\"markup\">");
  newString = newString.join("");
  newString = newString.replace("\n\n","");
  newString = newString.split("\n\n</arg></dynamic-widget>");
  newString = newString.join("");
  newString = newString.split("\n</arg></dynamic-widget>");
  newString = newString.join("");
  newString = newString.split("</arg></dynamic-widget>");
  newString = newString.join("");
  newString = newString.split("</arg>");
  newString = newString.join("");
  newString = newString.split("</dynamic-widget>");
  newString = newString.join("");

  document.getElementById('ext-gen37').value = newString;
}

function convertHTML() {
  var origString = document.getElementById('ext-gen37').value;

  var newString = origString.split("&");
  newString = newString.join("&amp;");
  newString = newString.split(">");
  newString = newString.join("&gt;");
  newString = newString.split("<");
  newString = newString.join("&lt;");

  newString = "<\?xml version=\"1.0\" encoding=\"UTF-8\"?><dynamic-widget name=\"apparel-storefront-widget\"><arg name=\"markup\">\n\n" + newString + "\n\n</arg></dynamic-widget>"
  document.getElementById('ext-gen37').value = newString;
}



});




// Everything below here is stuff that I copied from another script to apparently allow auto updating, I've updated the file paths to what they should be after the script is hosted on Improvement Ninjas.


// Create functions which are known to be 
// missing from Chrome's Greasemonkey API
if (typeof GM_getValue == 'undefined') {
    GM_getValue = function(name, defaultValue) {
        var value = localStorage.getItem(name);
        if (!value)
            return defaultValue;
        var type = value[0];
        value = value.substring(1);
        switch (type) {
            case 'b':
                return value == 'true';
            case 'n':
                return Number(value);
            default:
                return value;
        }
    }
}

if (typeof GM_setValue == 'undefined') {
    GM_setValue = function(name, value) {
        value = (typeof value)[0] + value;
        localStorage.setItem(name, value);
    }
}

if (typeof GM_log == 'undefined') {
    GM_log = function(message) {
        console.log(message);
    }
}

var NinjaAutoUpdate = new Object();
NinjaAutoUpdate.version = 1;
NinjaAutoUpdate.delta = 60 * 60 * 24 * 3; //3 days (?)

NinjaAutoUpdate.getEpoch = function() {
    return Math.round((new Date()).getTime()/1000);
};

NinjaAutoUpdate.init = function() {
    // check new version
    // compute current time
    var now = NinjaAutoUpdate.getEpoch();
    var updateAt = GM_getValue("NinjaAutoUpdate_LAST_CHECK", 0) + NinjaAutoUpdate.delta;

    if (updateAt > now) return; // dont do anything 
  
    // do a check
    GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://improvement-ninjas.amazon.com/gmget.cgi?check=XML_Converter.user.js',
        headers: {
            'User-agent': 'Mozilla/4.0 (compatible) Greasemonkey',
            'Accept': 'application/atom+xml,application/xml,text/xml',
        },
        onload: NinjaAutoUpdate.callback
        });
    // record time of last check
    GM_setValue("NinjaAutoUpdate_LAST_CHECK", NinjaAutoUpdate.getEpoch());
};

NinjaAutoUpdate.callback = function(response) {
    if (! Number(response.responseText)) {
        // ERROR!? What can be done now? Not a lot i reckon...
        return;
    }
    if (NinjaAutoUpdate.version != Number(response.responseText)) {
        NinjaAutoUpdate.createAlert();
    }
};

NinjaAutoUpdate.ignore = function(event) {
    GM_setValue("NinjaAutoUpdate_LAST_CHECK", NinjaAutoUpdate.getEpoch());
    NinjaAutoUpdate.cancelAlert();
    if (typeof event === "object" && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
};

NinjaAutoUpdate.install = function() {
    window.open('https://improvement-ninjas.amazon.com/gmget.cgi?get=XML_Converter.user.js');
    NinjaAutoUpdate.cancelAlert();
    GM_setValue("NinjaAutoUpdate_LAST_CHECK", NinjaAutoUpdate.getEpoch());
    if (typeof event === "object" && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
};

NinjaAutoUpdate.createAlert = function() {
    NinjaAutoUpdate.alert = document.createElement('div');
    NinjaAutoUpdate.alert.setAttribute('class', 'NinjaAutoUpdateOverlay');
    NinjaAutoUpdate.alert.innerHTML = "<style>.NinjaAutoUpdateOverlay {  font-size: 11px;  position: relative;  margin: 0 0 0 0;  padding: 4px 10px;  text-align: left;  z-index: 1000;  cursor: pointer;  background-color: #FFFFD5;  border-bottom:1px solid #E47911;  color: #990000;}.NinjaAutoUpdateOverlay a {  padding: 0px 4px;}.NinjaAutoUpdateOverlay .nau-right {  float: right;}</style><div>    <span style='font-size:larger'>    A new version of <strong>'XML_Converter.user.js'</strong> is available!    </span>  <a href='#' id='NinjaAutoUpdateInstall-XML_Converter.user.js'>    Get the new one!  </a>  <a href='#' id='NinjaAutoUpdateIgnore-XML_Converter.user.js' class='nau-right'>    Ignore for a few days  </a></div>";
    var first = document.body.firstChild;
    document.body.insertBefore(NinjaAutoUpdate.alert, first);
    NinjaAutoUpdate.alert.addEventListener("click", NinjaAutoUpdate.install, false);
    document.getElementById("NinjaAutoUpdateInstall-XML_Converter.user.js").addEventListener("click", NinjaAutoUpdate.install, false);
    document.getElementById("NinjaAutoUpdateIgnore-XML_Converter.user.js").addEventListener("click", NinjaAutoUpdate.ignore, false);
};

NinjaAutoUpdate.cancelAlert = function() {
  if (typeof NinjaAutoUpdate.alert === "object") {
    NinjaAutoUpdate.alert.parentNode.removeChild(NinjaAutoUpdate.alert);
    NinjaAutoUpdate.alert = undefined;
  }
};

// Init without waiting for load event, this code
// doesnt depend on any loaded DOM elements
NinjaAutoUpdate.init();