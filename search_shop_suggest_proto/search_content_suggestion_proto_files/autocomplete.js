///! Copyright (c) 2008-2010 Amazon.com, Inc., and its Affiliates.
//! All rights reserved.
//! Not to be reused without permission.
/*
  Owner: search-experience@
  Author: brundage@
*/

if (!window.$SearchJS && window.$Nav) {
  window.$SearchJS = $Nav.make();
}
if (window.$SearchJS) {
  
/**
 * Amazon Flyout Mouse Intent plugin.
 */
$SearchJS.importEvent('legacy-popover', 
            {as: 'popover', amznJQ: 'popover'});
$SearchJS.when('jQuery', 'popover').run(function($) {

$.fn.amznFlyoutIntent = function(arg) {
  // private 'static' data and methods. Nothing in this section can rely on settings for a particular plugin.
  // default configuration options
  var defaults = {
    // default behaviour is to designate the first absolutly positioned child element as the target for this element
    // this should generally work for flyout menues.
    getTarget: function (el) { return $(this).children('*[position="absolute"]').eq(0); },
    // the axis that the trigger elements are aligned along, can be 'x' or 'y'
    triggerAxis: 'y',
    majorDelay: 300,
    minorDelay: 100,
    targetSlopY: 50,
    targetSlopX: 50,
    cursorSlopBase: 25,
    cursorSlopHeight: 50,
    mtRegions: []
  },
  nameSp = 'amznFlyoutIntent',        //define the plugins namespace used to store data
  mt = $.AmazonPopover.mouseTracker,    // The popover mouse tracker, used as a utility
  
  // returns a rectangle as an array of two points. 
  // slop can be optionally added to produce a larger (or smaller) rectangle
  getRect = function(el, slopX, slopY) {
    var off = el.offset(),
         tl = {x: off.left - (slopX || 0), y: off.top - (slopY || 0)},
         // you need double the slop to compensate for subtracted slop!
         br = {x: tl.x + el.outerWidth() + ((slopX || 0) * 2), y: tl.y + el.outerHeight() + ((slopY || 0) * 2)};
    return [tl, br];
  },
  
  // Computes the barycentric coordinates of a triangle
  // The tri data structure consists of 3 points in no particular order
  triBC = function(tri) {
    var t0 = tri[0],
        t1 = tri[1],
        t2 = tri[2];
    return (t1.x - t0.x) * (t2.y - t0.y) - (t2.x - t0.x) * (t1.y - t0.y);
  },
  
  // Tests if the point, p, lies within the triangle described by tri
  // The tri data structure consists of 3 points in no particular order
  isInTri = function(p, tri) {
    // The math: Take the point p and each pair of points from the triangle.
    // This gives three new triangles. If the total area of the three new triangles is the same
    // as the original triangle, the new mouse position must be within the original triangle,
    // and the user must be moving towards the destination.
    // The cheapest math I could find for these computations uses barycentric coordinates,
    // cribbed from:  http://steve.hollasch.net/cgindex/math/barycentric.html
    var b0 = 1 / triBC(tri),
        t0 = tri[0],
        t1 = tri[1],
        t2 = tri[2];
    return (triBC([t1, t2, p]) * b0) > 0 
        && (triBC([t2, t0, p]) * b0) > 0 
        && (triBC([t0, t1, p]) * b0) > 0;
  },
  
  // Clamp a point p to the rect r in the x and y dimensions separately,
  // returning -1 if the point is less than, +1 if greater than, or 0 if in the rect.
  clamp = function(p, r) {
    var r0 = r[0],
        r1 = r[1];
    return { x: p.x < r0.x ? -1 : p.x > r1.x ? 1 : 0, 
             y: p.y < r0.y ? -1 : p.y > r1.y ? 1 : 0 };
  },
  
  // test if a point lies inside a rectangle
  isInRect = function(p, rect) {
    var c = clamp(p, rect);
    return c.x == 0 && c.y == 0;
  },
  
  // 5-way selector:
  // if (a < 0) return a0 else if (a > 0) return a1
  // else if (b < 0 ) return b0 else if (b > 0) return b1
  // else return d
  sel = function(a, b, a0, a1, b0, b1, d) {
    return a < 0 ? a0 : a > 0 ? a1 : b < 0 ? b0 : b > 0 ? b1 : d;
  },
  
  // If you lived in flat world, and you were at point p, looking towards rectangle rect
  // this function would find the two points that you see as the extreme left and right of the 
  // rectangle from your point of view.
  // rectangle rect is an array of two points that are the top left and bottom right of the rectangle.
  // e.g. [{x: 10, y:20}, {x: 50, y: 60}]
  getExtremePoints = function(p, rect) {
    var c = clamp(p, rect),
        cx = c.x,
        cy = c.y,
        r0 = rect[0],
        r1 = rect[1],
        r0x = r0.x,
        r0y = r0.y,
        r1x = r1.x,
        r1y = r1.y;
        return [ {x: sel(cy,cx,r0x,r1x,r0x,r1x,0), y: sel(cx,cy,r1y,r0y,r0y,r1y,0)},
                 {x: sel(cy,cx,r1x,r0x,r0x,r1x,0), y: sel(cx,cy,r0y,r1y,r0y,r1y,0)} ];
  },
  
  // test if a point c is within a 'cone' formed from vertex p1 and the appropriate corners of the target rectangle
  isInCone = function(cursor, p1, cfg) {
    var slopRect = $.extend(true, [], cfg.slopRect),
        sy = cfg.targetSlopY,
        sx = cfg.targetSlopX,
        c = clamp(p1, cfg.targetRect),
        cx = c.x,
        cy = c.y,
        sh = cfg.cursorSlopHeight,
        sb = cfg.cursorSlopBase,
        p = $.extend({}, p1),
        q = $.extend({}, p1),
        exP;
    
    // The new new larger slop-rectangle could produce a triangle that doesn't join with the target, 
    // in 4 cases we need to modify one of the points to take the slop out of the face closest to the cursor.
    // for the diagonal cases (nw, sw, ne, se) the triangle will intersect the target so this is not a concerne
    if (cy == 0) { // East/West
      slopRect[cx < 0 ? 0 : 1].x -= sy * cx;
    }
    else if (cx == 0) { // North/South
      slopRect[cy < 0 ? 0 : 1].y -= sb * cy;
    }
    
    // the p & q points are constructed so that the cone is larger towards the cursor.
    // their orientation is determined by the triggerAxis and then which 
    // by the side of the target triangle that the cursor is on.
    if (cfg.triggerAxis === 'x') {  // Triggers aligned on the x axis
      p.y = q.y -= sb * cy;
      p.x -= sh;
      q.x +=  sh;
    }
    else {  // Triggers aligned on the Y axis
      q.x = p.x -= sb * cx;
      p.y -= sh * cx;
      q.y += sh * cx;
    }
    
    exP = getExtremePoints(p1, slopRect);
    return isInTri(cursor, [p1, exP[0], exP[1]]) 
        || isInTri(cursor, [p1, exP[0], p]) 
        || isInTri(cursor, [p1, exP[1], q]);
  },
  
  // computes how long to wait before sampling the mouse location again.
  calcChangeDelay = function(c, rect, p1, p2, cfg) {
    // If the cursor is leaving the trigger element, but we think it's headed to the target,
    // (the flyout) we wait a long delay to give the user time to get there.
    // If we are not entierly sure where the user is going we wait a shorter delay
    // If we are certain the user is not going for the target we update immediatly.
    // The first call to this function is always on a transition from one area to another;
    // subsequent calls may be "chained" (via setTimeout()), as we wait to see where the cursor stops.
    var delay = 0;
    
    p1 = p1 || {};
    p2 = p2 || {};
    
    // If the cursor has entered the target rectangle we can stop tracking
    if (isInRect(c, rect)) {
      delay = -1;  
    }
    // if we are certain the cursor is headed towards the target wait the major delay
    else if (isInCone(c, p1, cfg)) {
      delay = cfg.majorDelay;
    }
    // If the point falls outside the cone BUT the mouse moved a very small distance AND
    // the cursor is within a cone drawn from the previous historical point
    // Poll again in a short time to confirm that the user is moving away from the target
    // (this is a RARE edge case and the extra isInCone() call should not kill performance when called this infrequently)
    else if (Math.abs(c.x - p1.x) < 10 && Math.abs(c.y - p1.y) < 10 && isInCone(c, p2, cfg)) {
      delay = cfg.minorDelay;
    }
    return delay;
  },
  
  // houskeeping for designating a new trigger element
  changeTrigger = function(el, cfg) {
    // trigger a mouse out on the current trigger if one is set and the client set up an event handler:
    cfg.triggerEl && cfg.onMouseOut && cfg.onMouseOut.call(cfg.triggerEl.get(0));
    // update to the new trigger element
    cfg.onMouseOver.call(el.get(0));  // trigger client event handler
    
    // we lazy load the targets because computing the rectangles turns out to be slow.
    if (!cfg.targets) {
      cfg.targets = {};
    }
    
    var tgt = cfg.targets[el];
    if (!tgt) {
      cfg.targets[el] = tgt = {triggerEl: $(el)};
      tgt.targetEl = cfg.getTarget.call(el.get(0));  // ask client for the target
      tgt.targetRect = getRect(tgt.targetEl);
      tgt.slopRect = getRect(tgt.targetEl, cfg.targetSlopY, cfg.targetSlopX);
    }
    
    cfg.triggerEl = tgt.triggerEl;
    cfg.targetEl = tgt.targetEl;
    cfg.targetRect = tgt.targetRect;
    cfg.slopRect = tgt.slopRect;
  },
  
  // public methods that can be accessed by plugin clients via $.amznFlyoutIntent('methodName', args...);
  m = {
    // used to unhook everything and stop any mouse tracking thats going on.
    // clients should call this when they hide or dissable the flyout for some reason.
    destroy: function() {
      var cfg = this.data(nameSp),
          i;
      if (cfg) {
        // halt all event processing
        clearTimeout(cfg.timeoutId);
        // disconnect mouseTracker
        for (i = 0; i < cfg.mtRegions.length; i++) {
          mt.remove(cfg.mtRegions[i]);
        }
        this.removeData(nameSp); //remove data from all elements
      }
    },
    
    // used to initialize an instance of the plugin
    init: function(opts){
      var cfg = this.data(nameSp);
      
      // object set on multiple elements using .data() are shared by ALL of the elements, not copied
      if (!cfg) {
        cfg = $.extend(defaults, opts);
        this.data(nameSp, cfg);
      }
      // also the cfg var is visible to all the closures that follow so we dont have to look it up again
      
      // for each trigger element, return to preserve method chaining
      return this.each(function () {
        var $this = $(this),
            off = $this.offset(),
            // The action to take when mouse tracker detects we're leaving the previous category.
            // Note that this is limited to removing the hover styles, since we don't actually disable a
            //   category until we've confirmed that the cursor has moved decisively to a new category.
            mouseLeave = function(immediately, args) {
              // call onMouseLeave
              cfg.onMouseLeave && this.el && cfg.onMouseLeave.call(this.el.get(0));
              return true;
            },
            // The action to take when mouse tracker detects we're entering a new category.
            mouseEnter = function(args) {
              // delayedChange (setTimeout() result) was only relevant while the cursor stayed within a trigger's area.
              clearTimeout(cfg.timeoutId);
              
              var trigger,
                  changeDelay,
                  doDelayedChange;
              
              // call onMouseEnter
              cfg.onMouseEnter && this.el && cfg.onMouseEnter.call(this.el.get(0));
              
              // If we've gone through an intermediate trigger element but returned to the one that's active, there's nothing to do.
              // this also catches the case where we are just starting and no trigger is the active trigger
              if (cfg.triggerEl && this.el && cfg.triggerEl !== this.el) {
                // Based on the mouse velocity relative to the subcat area, we may want to delay changing trigger elements.
                // changeDelay > 0 is a time (in ms) to wait, after which we recheck.
                // changeDelay == 0 means we should change trigger elements now.
                // changeDelay == -1 means two different things, depending on context:
                //   - on a real mouseEnter, we should change trigger elements now.
                //   - on a delayed (setTimeout()) check, we should leave the trigger element alone and stop rechecking.
                trigger = this.el;
                changeDelay = cfg.targetRect ? calcChangeDelay(args.cursor, cfg.targetRect, args.priorCursors[0], args.priorCursors[1], cfg) : -1;
                if (cfg.triggerEl && changeDelay > 0) {
                  // The Inception portion of our program. doDelayedChange can schedule itself recursively, via setTimeout().
                  doDelayedChange = function() {
                    var delayedArgs = mt.getCallbackArgs(),
                        nextDelay = 0;  // see explanation of changeDelay above; this is just the deferred version.
                    clearTimeout(cfg.timeoutId);
                    
                    // Check if the cursor has moved at all since the previous check.  If not, then check if the cursor
                    // is in the targetRect.  If it's in the targetRect, leave display alone.  If it's outside the targetRect,
                    // change the trigger element display immediately.  If it's still moving, then delay again.
                    if (cfg.priorCursor && cfg.priorCursor.x === delayedArgs.cursor.x && cfg.priorCursor.y === delayedArgs.cursor.y) {
                      nextDelay = isInRect(delayedArgs.cursor, cfg.targetRect) ? -1 : 0;
                    }
                    else {
                      nextDelay = calcChangeDelay(delayedArgs.cursor, cfg.targetRect, delayedArgs.priorCursors[0], delayedArgs.priorCursors[1], cfg);
                    }
                    // Record the cursor position, so on the next call, we can see if it has moved at all.
                    cfg.priorCursor = {x:delayedArgs.cursor.x, y:delayedArgs.cursor.y};
                    if (nextDelay > 0 && cfg.triggerEl.get(0) !== trigger.get(0)) {
                      cfg.timeoutId = setTimeout(function () { doDelayedChange.call(trigger); }, nextDelay);
                    }
                    else if (nextDelay > -1) {
                      if (isInRect(delayedArgs.cursor, getRect(trigger))) {
                        changeTrigger(trigger, cfg);
                      }
                      else {
                        // the cursor is not in the trigger rectangle, it's off in space somewhere.
                        // fire the onMouseOut event handler if present
                        cfg.onMouseOut && cfg.onMouseOut.call(trigger.get(0));
                      }
                    }
                  }; // end doDelayedChange
                  
                  cfg.timeoutId = setTimeout(doDelayedChange, changeDelay);
                }
                else {
                  changeTrigger(this.el, cfg);
                }
              }
              else {
                changeTrigger(this.el, cfg);
              }
              return true;
            };
            
        // Hand the triger region off to mouse tracker, using its arcane API.
        // Then, record the region, so we can disable it later on in destroy().
        cfg.mtRegions.push(mt.add([[off.left, off.top, $this.outerWidth(), $this.outerHeight()]], {inside: false, mouseEnter:mouseEnter, mouseLeave:mouseLeave, el: $this}));
      });
    }
  }; // end public methods hash
  
  // plugin function mechanics
  if (m[arg]) {
    return m[arg].apply(this, Array.prototype.slice.call(arguments, 1));
  }
  if (typeof arg === 'object' || !arg) {
    return m.init.apply(this, arguments);
  }
  return this; // allow chaining if we didnt understand the args.
};

$SearchJS.publish('amznFlyoutIntent');
});
// End Amazon Flyout Mouse Intent plugin

/*
JavaScript for autocompleting user input on a specified text field.

Usage:
amznJQ.available('search-js-autocomplete', function() {
  yourGlobal = new Autocomplete(options);
});

where options is a list of key/value pairs.  The available parameters are:

Required Parameters:
  Name      Description
  -----------------------------------------------------------------------------------------------
  src       a string (service domain and path), a fixed array of words, or a function.  See data sources discussion below.
  mkt       the numeric marketplace ID.  Passed to the completion service or function.
  aliases   an array of alias names
  deptText  text used for category suggestions.  {department} is replaced by the department name.
  sugText   text used in suggestion box

Optional Parameters:
  Name       Default Value            Description
  -----------------------------------------------------------------------------------------------
  cid        "amazon-search-ui"       the client ID
  sb         "#twotabsearchtextbox"   the HTML ID of the text box to provide autocompletion for
  form       "#navbar form[name=site-search]"
  dd         "searchDropdownBox"
  callback   undefined
  sc         0                        use spell-correction
  protocol   window.parent.document   the protocol to use when invoking the service
                 .location.protocol
  valInput   undefined                the selector of a form input to update with the value
  submit     undefined                the selector of the submit button to update
  submitImg  undefined                the src of the disabled submit button image
  multiword  0                        enable multiword search when using an array as source
  normalize  undefined                caller defined function to normalize the keyword and suggestion data
                                        (limited to non-length-changing character substitutions right now)
                                        (default s.toLowerCase normalization applied if left undefined)
  pe         undefined                the parent element to attach the inline suggestions to
                                        if not set, the code will fallback to use sb.parent()
  fb         0                        Use fallback to APS. Off by default.
  xcat       0                        Get cross category suggestions for each suggestions returned. Off by default.
  twoPane    0                        Which version of the Two Pane display to use. Default 0: dont use two pane.
  iac        0                        enable inline auto complete
  dupElim    0                        Enable duplicate elimination by passing a new param to iss service  
  maxSuggestions 10                   Maximum search sugggestions to show
  scs        0                        enable separate category suggestion
  imeSpacing 0                        vertical expansion of ISS when IME is on in CN
  np         0                        the number of non-prefix suggestions we want A9 to give us
  deepNodeISS undefined               if defined this is a map configuring ISS to support suggestion display
                                        even for deeper browser nodes.  Values in the map are:
                                          searchAliasAccessor - pointer to a function that returns the current page's search alias
                                          showDeepNodeCorrection - boolean telling us to display the fact that we're bouncing the 
                                            user to the higher level aliad
                                          stayInDeepNode - boolean if our suggestion will lead to a search in the same deep browser node
                                            that the user is already in
  custIss4Prime      0               deliver custom ISS for this Prime user
  doCTW      undefined               function to execute after ISS is shown for doing Client Triggered Weblabs

Data Sources:
This script supports using the following sources for the suggestion data:
 1. a service (e.g., "completion.amazon.com/search/complete")
 2. an array  (e.g., [ "apple", "banana", "orange" ] )
 3. a function

When a service is the source, then on every keypress, an AJAX call is made to that service to retrive
the suggestions.  This call has the form:

  protocol://service?method=completion&q=keyword&search-alias=alias&client=clientID&mkt=marketplaceID&x=updateFunc&sc=useSpellCorrection

The call is expected to (async) return an array containing four members:

  [ keyword, [ suggestions ], [ category suggestions], [] ]

Example request:
 http://completion.amazon.com/search/complete?method=completion&q=ipid&search-alias=aps&client=amazon-search-ui&mkt=1&sc=1

Example response:
 ["ipid",["ipod"],[{"nodes":[{"name": "Electronics", "alias": "electronics"}],"sc":"1"}],[]]

The first value is the keyword typed so far, to which these ISS suggestions apply.
The second value is a list of strings, which are the suggested keywords.
The third value is a list of objects, which may contain suggested categories.  Each suggested category has
a nodes property which is a list of category objects.  It may also have an optional sc parameter,
indicating this suggestion involved spell-correction.  The category objects have two key/value pairs for the
search alias and the display name.

Unusually, this API always emits all four members of the array, even though
the fourth is currently never used, and the third is often a list of empty objects.

When an array is the source, then no service is invoked; instead, the array is used in lieu of
the suggestions.  Category suggestions are not supported in this case.  This case is convenient for
fixed dictionaries, such as a small list of brand names.

When a function is the source, then this function is passed an object containing the parameters
to be used, which are identical to those passed to a service (method, q, search-alias, client,
mkt, and optionally sc), as well as an optional callback parameter.  If no callback is used,
the function returns the data synchronously; if a callback is used, then the callback will be
called with the data (possibly asynchronously, possibly even before this function returns).
The data has the same format as the service case.
*/

$SearchJS.when('jQuery', 'amznFlyoutIntent').run(function($) {
  
(function(window, undefined) {
var merchRE = /^me=/
  , refre = /(ref=[-\w]+)/
  , ltrimre = /^\s+/
  , spaceNormRe = /\s+/g
  , ddre = /_dd_/
  , ddaliasre = /(dd_[a-z]{3,4})(_|$)[\w]*/
  , deptre = /\{department\}/g
  , slashre = /\+/g
  , aliasre = /search-alias\s*=\s*([\w-]+)/
  , nodere = /node\s*=\s*([\d]+)/
  , merchantre = /^me=([0-9A-Z]*)/
  , noissre = /ref=nb_sb_noss/
  , dcs = "#ddCrtSel"
  , sdpc = "searchDropdown_pop_conn"
  , tostr = Object.prototype.toString
  , ddBox
  , metrics = {
      isEnabled: typeof uet == 'function' && typeof uex == 'function',
      init: 'iss-init-pc',
      completionsRequest0: 'iss-c0-pc',
      completionsRequestSample: 'iss-cs-pc',
      sample: 2, // index of the sample request for sample metrics, right now its fixed to the third request
      noFocusTag: 'iss-on-time',
      focusTag: 'iss-late'
  };

// TODO: Remove when we upgrade to jQuery 1.4
$.isArray = $.isArray || function(o) {
  return tostr.call(o) === "[object Array]";
};

//
// The search suggestion display.
// sb = the search bar object
// pe = parent element to append the display to
// displayHtml = the HTML fragment used to create the display
// handlers = dictionary of event handlers
var SS = function(sb, pe, displayHtml, handlers) {
  // The jQuery node that is the search suggest div.
  var node,
      noOp = function () {},
      defaults = {
        afterCreate: noOp,      // called after the box is created for the first time
        beforeShow: noOp,       // called before the box is shown
        afterShow: noOp,
        beforeHide: noOp,       // called before the box is hidden
        beforeHtmlChange: noOp, // called right before the HTML content of the suggest box is changed
        afterHtmlChange: noOp,  // called right after the HTML content of the suggest box is changed
        onWindowResize: noOp    // called when the window.resize event is fired
      },
      events = $.extend({}, defaults, handlers)
  
  function create() {
    // create the node
    node = $(displayHtml).appendTo(pe || sb.parent());
    
    // call the after create event so you can fix up whatever you want to
    events.afterCreate.call(node);
    
    // hook up the window resize handler
    $(window).resize(function (e) { events.onWindowResize.call(node, e) });
        
    return node;
  }

  // Get or create the search suggestion node.
  function get() {
    return node || create();
  }

  // Set the content of the search suggestion pop-up.
  function setHtml(h) {
    events.beforeHtmlChange.call(get(), h);  // pass the HTML so the event handler can respond to it
    get().html(h);
    events.afterHtmlChange.call(get(), h);   // pass the HTML so the event handler can respond to it
    return this;
  };
  
  // Public interface
  ///////////////////
  
  // Get or create the underlying jQuery enabled dom node
  this.getNode = get;
  
  // set the html of the search suggestion pop-up
  this.html = setHtml;
  
  // Return true if the search suggestion pop-up is visible.
  this.visible = function() {
    if (node) {
      return node.css("display") != "none";
    }

    return false;
  };

  // Hide the search suggestion pop-up and erase its contents.
  this.hide = function() {
    // always hide the searchSuggest Div before deleting its content. Otherwise, slow browsers could leave a lingering empty div.
    events.beforeHide.call(get());
    get().hide();
    setHtml('');
    return this;
  };

  // Show the search suggestion pop-up.
  this.show = function() {
    events.beforeShow.call(get());
    get().show();
    events.afterShow.call(get());
    return this;
  };
};

// The inline auto complete object
// the iac indicates which treatments we are in.
var IAC = function(sb, pe, iac, newDesign) {
  // the search box place holder jQuery node
  var sbPlaceHolder,
    // the underlying DOM node for place holder
    sbPlaceHolderDiv,
    // the search box jQuery node
    sbNode,
    // underlying DOM node for search box
    sbDiv,
    // the inline auto complete object jQuery node
    iacNode,
    // underlying DOM node for inline auto complete object
    iacDiv,
    // for nav new design we need fetch width here
    widthDiv,
    // flag indicates whether inline auto complete can be shown
    // true as default
    canShowIAC = true,
    // this variable indicates how customer is using inline auto complete,
    // 0 means the customer is not using it, this is default value
    // 1 means the customer uses it by directly press the enter key
    // 2 means the customer uses it by pressing right arrow
    iacType = 0;
  
  function get() {
    return iacNode || create();
  }
  
  // create the Dom objects
  function create() {
    var p = sb.pos(true),
        d = sb.size(true),
        sbPlaceHolderCss = {
          top: p.top,
          left: p.left,
          width: '100%',
          border: '2px inset'
        },
        sbPlaceHolderCssOverride = {
          background: 'none repeat scroll 0 0 transparent',
          color: 'black',
          'font-family': 'arial,sans-serif',
          'font-size': '12pt',
          height: '23px',
          margin: '7px 0 0',
          outline: '0 none',
          padding: 0,
          border: '0 none'
        },
        iacNodeCss = {
          left: p.left,
          width: d.width,
          top: p.top,
          'z-index': 1,
          color: '#999',
          position: 'absolute',
          'background-color': '#FFF'
        },
        iacNodeCssOverride = {
          left: p.left + 5,
          width: d.width - 5,
          border: '0 none',
          'font-family': 'arial,sans-serif',
          'font-size': '12pt',
          height: '23px',
          margin: '7px 0 0',
          outline: '0 none',
          padding: 0
        };
  
    // create a place holder for search box
    sbPlaceHolder = $("<input id='sbPlaceHolder' class='searchSelect' readOnly='true'/>").css(sbPlaceHolderCss)
                    .css(newDesign ? sbPlaceHolderCssOverride : {})
                    .appendTo(pe || sb.parent());

    sbPlaceHolderDiv = sbPlaceHolder.get(0);
  
    // make the search box position absolute
    sbNode = $("#twotabsearchtextbox").css({
      position: 'absolute',
      background: 'none repeat scroll 0 0 transparent',
      'z-index': 5,
      width: d.width
    });

    sbDiv = sbNode.get(0);
    
    // create the Inline auto complete node
    iacNode = $("<input id='inline_auto_complete' class='searchSelect' readOnly='true'/>").css(iacNodeCss)
              .css(newDesign? iacNodeCssOverride : {})
              .appendTo(pe || sb.parent());

    iacDiv = iacNode.get(0);

    // this is to fix the bug that clientWidth is changed by scroll bar showing up.
    setInterval(adjust, 200);
    
    // override behavior to special key
    sbNode.keydown(keyDown);

    //get the widthDiv for nav redesign
    if (newDesign)
    {
      widthDiv = sb.parent().parent();
    }
    
    return iacNode;
  }
  
  function adjust() {
    var p = sb.pos(),
      d = sb.size(),
      adjustment = 0,
      w = d.width;
    if (newDesign)
    {
      adjustment = 5;
      w = widthDiv.width() - adjustment;
    }

    sbNode.css({
      left: p.left + adjustment,
      top: p.top,
      width: w
    });
    
    iacNode.css({
      left: p.left + adjustment,
      top: p.top,
      width: w
    });
  }
  
  function keyDown(event) {
    // each time a key is pressed, we should clean the inline auto complete first
    var value = get().val();
    get().val('');
    var key = event.keyCode;
    switch(key) {
      // cases when the auto complete should be cleared
      case 8: // backspace
      case 37:// left arrow
      case 46:// delete
        if (value && value.length > 0) {
          event.preventDefault();
        }
        iacType = 0;
        canShowIAC = false;
        break;
      // for whitespace, just clear the auto complete
      case 32:
        iacType = 0;
        canShowIAC = false;
        break;
      // enter or right arrow pressed, auto complete the keyword unless in the case that iac equals 2
      case 13:
        if (iac == 2) {
          // don't pick auto complete in this case
          break;
        }
        // fall through
      case 39:
        if (value && value.length > 0){
          sb.keyword(value);
          iacType = key == 13 ? 1 : 2;
        }
        canShowIAC = true;
        break;
      // case when auto complete should be retained
      case 16: // shift
      case 17: // control
      case 18: // alt
      case 20: // caps lock
      // treat 229 specially. When using IME under IE, any keydown event is captured as 229
      // the auto complete will be cleared after quit IME which is not expected.
      case 229: 
        get().val(value);//fall through
      default:
        iacType = 0;
        canShowIAC = true;
        break;
    }
  }

  this.val = function(value) {
    if (value !== undefined) {
      get().val(value);
    }
    return get().val();
  }
  
  this.clear = function() {
    get().val('');
  }
  
  this.type = function() {
    return iacType;
  }
  
  // Passing no parameter to retrieve the canShowIAC value
  this.displayable = function(showIAC) {
    if (showIAC !== undefined) {
      canShowIAC = showIAC;
    }
    return canShowIAC;
  }
  
  // Help method to ensure the IAC Dom nodes have been created. 
  this.touch = function() {
    get();
    return true;
  }
};

//ime Handler
var IH = function(updateFunc){
  var curIme,
      ku,
      kd,
      validKey,
      
      //the srotationFlag and skeyupFlag will be set when the text in search box is selected
      //srotationFlag used by ime rotation (check the keywords change), 
      //skeyupFlag used by keyup event
      srotationFlag =0,
      skeyupFlag =0,
      
      updateKwChange = updateFunc;
  
  function clearCurIme(clearRotationFlag){
    // if the srotationFlag is setted, then we don't clear the curIme and reset the kd and ku
    // reason: when the text in the search box is selected, when user type a char key, then the keywords
    // in the search box will be changed, but the key will be entered into search box when use the 
    // Microsoft pingying IME while the key will be not enetered into search box when use the sougou pingying IME and
    // google pingying IME. If we reset the kd and ku, the key will be ignore for the sougou IME and google IME.
    if (clearRotationFlag && srotationFlag == 1) {
      srotationFlag = 0;
    } else {
      kd = ku = undefined,
      curIme = "";
    }
    validKey = false;
  }

  function keydown(keyCode){
    validKey = false;
    //reset the two flag beacuse:
    //1, srotationFlag = 1 and skeyupFlag =0 happens when user select the keywords in the search box and then click the search box 
    // and input the second char.
    //In this case, we should do the normal process after user input one char when using the MS pinyin IME.
    //2, srotationFlag = 0 and skeyupFlag =1 happens when user select the keywords in the search box and press the "Del" key.
    //In this case, we should set the skeyupFlag with 0, then iss will be showed when user input any char. 
    if (srotationFlag != skeyupFlag) {
      srotationFlag = skeyupFlag = 0;
    }
    return keyCode ? kd = keyCode : kd;
  }

  function update(sbCurText){
      if(updateKwChange){
        updateKwChange(sbCurText && sbCurText.length > 0 ? sbCurText + curIme : curIme);
      }
  }

  function keyup(keyCode, sbCurText){
    if (keyCode != undefined) {
      ku = keyCode;
      
      //if we are deleting a char from IME
      if(curIme && curIme.length > 0 && (ku == 8 || ku == 46)) {
        curIme = curIme.substring(0, curIme.length - 1);
        if (skeyupFlag == 1) {
          skeyupFlag = 0;
        }
        validKey = true;
        update(sbCurText);
      }
      else if(ku >= 65 && ku <= 90){ // latin letter
        var kchar = String.fromCharCode(ku);
        curIme += kchar;
        validKey = true;
        // when the skeyupFlag is setted, don't get the ISS
        // reason: For the Microsoft pingying IME, when select the text in the 
        // search box and type a char key, the keywords in the search box will change into the 
        // that key, now if we composite the keywords in the search box and the curIME, it will double 
        // the key user typed.
        if (skeyupFlag == 1) {
          skeyupFlag = 0;
        } else {
          update(sbCurText);
        }
      }
      //we just ignore other cases
    }
    return ku;
  }
  
  //We should only handle when keydown is 229 or 197(opera)
  function shouldHandle(){
      return kd == 229 || kd == 197;
  }
  
  //indicate the current key can be handled or not
  function isValidKey() {
    return validKey;
  }
  
  //update the flag of reset and keyup
  function setFlag() {
    srotationFlag = 1;
    skeyupFlag = 1;
  }

  //imeHandler Interface
  this.keydown = keydown;
  this.keyup = keyup;
  this.isImeInput = shouldHandle;
  this.reset = clearCurIme;
  this.isValidKey = isValidKey;
  this.setFlag = setFlag;
}

//
// The search text box.
//
var SB = function(sb, h) {
      // current text
  var curText,
    // current selected text in the suggestions (if any)
    // TODO move this
    curSel,

    //keeping track of the last known keywords from the user
    latestUserInput,
  
    // Dom node object used for size/pos/offset method
    navIssAttach,
    sbPlaceHolder,
    
    // the flag to indicate the customer is using IME to input or not
    // if it is true, we should add the space like moving down the ISS suggestion
    // it if is false, we do not change anything
    imeUsed = false,
     
    //ime handler
    ih = h.opt.imeEnh && new IH(function(val){updateKwChange(val);});
  

  init();

  // Initializer.
  function init() {
    // metrics, check if the user put focus in the search box or not. We do this right before we bind the event handlers.
    if(metrics.isEnabled) {
      // TODO: This can be replaced by sc.is(":focus"); once we migrate to jQuery 1.6.4
      ue.tag(sb.get(0) === document.activeElement ? metrics.focusTag : metrics.noFocusTag);
    }

    // TODO: When we switch to jQuery 1.6.4, replace these with a single bind.
    sb.keydown(keyDown)
      .keyup(keyUp)
      .keypress(keyPress)
      .select(select)
      .blur(blurHandler)
      .focus(focusHandler)
      .click(clickHandler);

    latestUserInput = curText = kw();
    
    // navIssAttach can be initialized here
    h.newDesign && (navIssAttach = $("#nav-iss-attach"));
  }

  // Get/set the search bar text.
  function kw(k) {
    if (k !== undefined) {
      curText = curSel = k;
      sb.val(k);
    }
    //We need to keep the space at the end of the input keywords   
    // and then preform white space normalization when the keywords are read from the input field
    return sb.val().replace(ltrimre, '').replace(spaceNormRe, ' ');
  }

  // Get/set the search bar input
  function input(k) {
    if (k !== undefined) {
      latestUserInput = k;
    }
    return latestUserInput;
  }

  // Cautionary tales about handling key events compatibly across browsers:
  // http://www.quirksmode.org/js/keys.html
  // jQuery normalizes some of the keyCode/charCode weirdnesses, but does not
  // shield us from other concerns, namely:
  // - Only keypress handles repetition (key held down, repeating)
  // - Arrow keys, enter, escape, and others cannot be detected reliably with keypress.

  function keyDown(e) {
    var key = e.keyCode
      , d = key == 38 ? -1 : key == 40 ? 1 : 0;
    if(ih){ 
      ih.keydown(key);
    }
    // to track whether customer is using IME or not
    // keep the status in this session if the customer was in IME once
    // if customer input (0-9) or (a-z), that means customer does not use IME anymore.
    imeUsed = (key == 229 || key == 197) ? true : 
        ((key >= 48 && key <= 57) || (key >= 65 && key <= 90)) ? false : imeUsed;
    // down arrow = +1, up arrow = -1, all others = 0
    if(h.opt.twoPane === 1) {
      return h.twoPaneArrowKeyHandler(e);
    }

    if (d) {
      h.adjust(d);

      // We only need to suppress the default behaviour if we are overriding
      // it in some way
      if ( kw() != '' )
        e.preventDefault();
    }
    
    // TODO: Repeated arrows don't work in Mac FF.
    // Moving this code to keyUp breaks Mac Chrome.
    // Duplicating this code in keyUp leads to double-counting.
    
    // run any Client Triggered Weblabs function that we were provided
    // 
    // we do this on keydown so that we can trigger regardless of ISS actually
    // being available on the current page or not
    if (h.opt.doCTW) {
      h.opt.doCTW(e);
    }
  }

  function keyUp(e) {
    var key = e.keyCode;
    switch(key) {
      // enter
      case 13:
        h.hide();
        break;

      // escape
      case 27:
        return h.dismiss();

      // Don't update for arrow keys.
      case 37: // left arrow
      case 38: // up arrow
      case 39: // right arrow
      case 40: // down arrow
        break;

      default:
        //update searchbox input here
        if (ih && ih.isImeInput()){
          ih.keyup(key, curText);
        }
        else {
          update(true);
        }
        break;
     }
  }

  function keyPress(e) {
    var key = e.keyCode;
    switch(key) {
      // enter
      case 13:
        // Disable Enter if submit button is disabled
        return h.submitEnabled();

      default:
        // Skip enter and arrow keys
        h.keyPress();
        break;
    }
  }
  
  function select(e) {
    if (ih) {
      ih.setFlag();
    }
  }

  function updateKwChange(val){
    input(val);
    h.change(val);
  }

  //do the ime rotation
  function update(dontCheckCurSel) {
    var val = kw();
    if (val != curText && (dontCheckCurSel || val != curSel)) {
      curText = val;
      updateKwChange(val);
      if(ih) {
        ih.reset(true);
      }
    }
  }

  function focusHandler(e) {
    if(ih){
      ih.reset();
    }
  }

  function blurHandler(e) {
    h.dismiss();
    if(ih){
      ih.reset();
    }
  }

  function clickHandler(e) {
    h.click(kw());
    if(ih){
      ih.reset();
    }
  }

  // get the sbPlaceHolder dom, initializing at the first time.
  function getSbPlaceHolder() {
    if (!sbPlaceHolder) {
      sbPlaceHolder = $("#sbPlaceHolder");
    }
    return sbPlaceHolder;
  }
  
  // Pass no arguments to retrieve the current search box text.
  // Pass a string to set the current search box text.
  this.keyword = function(k) {
    return kw(k);
  };

  // Retrieve or set the user input
  this.userInput = function(k) {
    return input(k);
  };

  // Get the size (width, height) of the search box.
  // nonIAC indicates the sbPlaceHolder should not be used.
  this.size = function(nonIAC) {
    var e = sb;
    if (h.newDesign) {
      e = navIssAttach;
    } else if (!nonIAC && h.iac && h.checkIAC()) {
      e = getSbPlaceHolder();
    }
    return { width: e.outerWidth(), height: e.outerHeight() };
  };

  // Get the position (left, top) of the search box.
  // nonIAC indicates the sbPlaceHolder should not be used.
  this.pos = function(nonIAC) {
    var e = sb;
    if (h.newDesign) {
      e = navIssAttach;
    } else if (!nonIAC && h.iac && h.checkIAC()) {
      e = getSbPlaceHolder();
    }
    return e.position();
  };

  // Returns the offset of the search bar relative to the document
  // nonIAC indicates the sbPlaceHolder should not be used.
  this.offset = function(nonIAC) {
    var e = sb;
    if (!nonIAC && h.iac && h.checkIAC()) {
      e = getSbPlaceHolder();
    }
    return e.offset();
  }

  // Get the parent node of the search box.
  this.parent = function() {
    return sb.parent();
  };

  // determine if the searchBox has focus
  this.hasFocus = function() {
    // TODO: This can be replaced by sc.is(":focus"); once we migrate to jQuery 1.6.4
    return sb.get(0) === document.activeElement;
  };

  this.cursorPos = function() {
    var input = sb.get(0);
    if ('selectionStart' in input) {
      // Standard-compliant browsers
      return input.selectionStart;
    } else if (document.selection) {
      // IE
      input.focus();
      var sel = document.selection.createRange();
      var selLen = document.selection.createRange().text.length;
      sel.moveStart('character', -input.value.length);
      return sel.text.length - selLen;
    }
    return -1;
  };

  // Determine whether to update the current text.
  this.update = update;

  // Blur the search bar
  this.blur = function() {
    sb.blur();
  };

  // Puts browser focus into the search bar
  this.focus = function() {
    // Updating the content like this makes sure the cursor is at the end of
    // any value that is prefilled in the search field
    var val = sb.val();
    sb.focus().val('').val(val);
  };

  // Attaches a keydown event handler to the search box
  // If h is undefined in jQuery 1.2.6 this will trigger the keydown event. In 1.6.4 it won't trigger.
  this.keydown = function(h) {
    sb.keydown(h);
  };

  // Attaches a click event handler to the search box
  // If h is undefined in jQuery 1.2.6 this will trigger the click event. In 1.6.4 it won't trigger.
  this.click = function(h) {
    sb.click(h);
  };

  // Attaches a callback for when the search box gains focus
  // If h is undefined in jQuery 1.2.6 this will trigger the focus event. In 1.6.4 it won't trigger.
  this.onFocus = function (h) {
    sb.focus(h);
  }

  // Attaches a callback for when then search box loses focus
  // If h is undefined in jQuery 1.2.6 this will trigger the blur event. In 1.6.4 it won't trigger.
  this.onBlur = function (h) {
    sb.blur(h);
  }

  // check the input is from IME or not for vertical expansion case
  this.isImeUsed = function() {
    return imeUsed;
  }
  
  // check whether the ime enhancement feature is used or not
  this.isImeEnhUsed = function() {
    return imeUsed && h.opt.imeEnh && ih.isValidKey();
  }
};

// The autocompletion object.
var AC = function(opts) {
  var opt = {}
    , names
    , values

    // END Input variables

    // the current selection index in the suggestion list
    , crtSel = -1  // -1 indicates the input box is selected
    
    // indicate whether the first suggestion should be redirected
    // if the weblab SEARCH_15460 is on T1 and there is only one suggestion keyword and the source of the keywords is "fb"
    // redirect the first suggestion
    ,redirectFirstSuggestion = false
    
    // the current xcat selection index in the xcat array
    , crtXcatSel = -1  // -1 indicates nothing is selected

    // array of suggestion objects
    , suggestionList = []

    // array of objects that represent 2 pane suggestions
    , twoPaneSuggestionsList = []

    // the number of suggestions displayed (can be less than the number returned from the server)
    , curSize = 0

    // timer id used to delay the hiding of the suggestions list
    , hideDelayTimerId = null

    // timer id used to delay the execution of a new search suggestion request
    , timer = null

    // maximum number of category suggestions that will be displayed
    , maxCategorySuggestions = 4
    
    , categorySuggestions = 0
    
    // an indicator to move down ISS or not
    , imeSpacing = 0

    , suggestRequest = null

    // an index into the master data list indicating where the first suggestion option was found
    , first = -1

    // default search drop down value
    , defaultDropDownVal

    // keep track of the value that we insert in the drop down when a category suggestion is selected
    , insertedDropDownVal

    // use to determine the IE6 case when a DOM update is not applied immediately
    , delayedDOMUpdate = false

    // Truthy if this gets suggestions from a static array.
    , staticContent

    // The search text box object.
    , searchBox

    // (optional) keystroke interceptor
    , keystroke

    // (optional) suggestion interceptor
    , sugHandler

    // The inline auto complete object
    , inlineAutoComplete
    
    // The search suggestions pop-up object.
    , searchSuggest

    // a flag used to keep track of whether or not iss activity is allowed (sending requests and processing responses)
    , activityAllowed = true

    // promotion list
    , promoList = []

    // type: sugg - search suggestions, promo - promotions. set to promo when we are displaying promotions, etc.
    , suggType = "sugg"

    // flag indicating if we are in new navbar or not. use nav-beacon to detect it.
    , newDesign = $("#navbar").hasClass("nav-beacon")

    , defaults = {
      sb:        "#twotabsearchtextbox",
      form:      "#navbar form[name='site-search']",
      dd:        "#searchDropdownBox",
      cid:       "amazon-search-ui",
      action:    "",
      sugPrefix: "issDiv",
      // TODO: sugText should be required, since this default doesn't support I18N
      sugText:   "Search suggestions",
      fb:        0,
      xcat:      0,
      twoPane:   0,
      dupElim:   0,
      imeSpacing: 0,
      maxSuggestions: 10
    }

    //timestamp for last key pressed
    ,lastKeyPressTime
    //time taken to render the suggestions display for the first time
    ,timeToFirstSuggestion = 0
    //search alias you are coming from
    ,searchAliasFrom
    //default timeout 
    ,defaultTimeout = 100
    ,reqCounter = 0
    
    //indicate whether or not use the ime enhancement feature
    ,imeEnhUsed = false;

    // Temporarily, to avoid breaking legacy uses of this file, we allow opts to be omitted
    // and deprecated initDynamic or initStatic to be invoked instead.
    opts && init(opts);

    function init(opts) {
      $.extend(opt, defaults, opts);
      // Promotion is only shown in navbar and when new design is in use
      newDesign = opt.isNavInline && newDesign;

      var src = opt.src,
          staticContent = $.isArray(src),
          resizeToken = null;

      lookup(opt, "sb");
      if (!opt.sb) {
        return;
      }
      
      searchBox = new SB(opt.sb, {
        adjust: move,
        twoPaneArrowKeyHandler: twoPaneArrowKeyHandler,
        hide: hideSuggestions,
        dismiss: dismissSuggestions,
        change: (staticContent ? update : delayUpdate),
        submitEnabled: submitEnabled,
        keyPress: keyPress,
        click: clickHandler,
        newDesign: newDesign,
        iac: opt.iac,
        checkIAC: checkIAC, 
        opt: opt
      });

      lookup(opt, "pe");

      if (opt.iac) {
          inlineAutoComplete = new IAC(searchBox, opt.pe, opt.iac, newDesign);
      }
      
      if (opt.twoPane == false) {
        searchSuggest = new SS(searchBox, opt.pe, '<div id="srch_sggst"/>',
          {
            afterCreate: resizeHandler,
            onWindowResize: resizeHandler,
            beforeShow: resizeHandler
          }
        );  
      }
      else {
        searchSuggest = new SS(searchBox, opt.pe, '<div id="srch_sggst" class="two-pane" style="display:none"/>', //PCOSTA this is where search suggest is defined
          {
            // after creation the box contains no content so just re-position it
            afterCreate: twoPaneSetPosition,
            beforeHtmlChange: twoPaneDestroyFlyout,  // destroy the flyout plugin before the elements are destroyed
            beforeShow: twoPaneSetPosition,
            afterShow: function (h) {
              twoPaneSetPosition.call(this);
              twoPaneSetXcatPosition.call(this);
              twoPaneBindFlyout.call(this);
            },
            onWindowResize: function () {
              var $this = this,
                  resize = function () {
                            twoPaneDestroyFlyout.call($this);  // destroy the flyout stuff only once per resize
                            twoPaneBindFlyout.call($this);
                            resizeToken = null;
                          };
              
              // clear the timer so it doesn't fire
              window.clearTimeout(resizeToken);  
              
              // set up a timout callback that re-attaches the amznFlyoutIntent plugin.
              // this has the effect of continuing to delay re-binding if the browser fires the event continuously.
              resizeToken = window.setTimeout(resize, 100);  // 100ms seems long in testing
              
              // these actions need to be run ever time for a smooth appearance
              twoPaneSetPosition.call($this);
              twoPaneSetXcatPosition.call($this);
            }
          }
        );
      }
      
      lookup(opt, "form");
      lookup(opt, "valInput");
      lookup(opt, "dd");
      lookup(opt, "submit");

      ddBox = opt.dd;
      opt.protocol = opt.protocol || window.document.location.protocol || "http:";

      // Save the original category dropdown value
      if (ddBox) {
        defaultDropDownVal = ddBox.val();
      }

      if (staticContent) {
        names = src[0];
        values = src[1];
        opt.sb.removeAttr('style'); // TODO: why?
      } else {
        // TODO: opt.callback;
      }

      if (opt.submit) {
        disable('disabled');
        opt.submitImgDef = opt.submit.attr("src");
        opt.submitToggle = opt.submitImgDef && opt.submitImg;
      }

      // IME languages don't consistently generate key events, so periodically check for changes.
      // TODO: Revisit
      if(opt.ime) {
        window.setInterval(function() {
          searchBox.update();
        }, 20);
      }
      
      $SearchJS.importEvent('navbarPromos');
      $SearchJS.when('navbarPromos').run(function() {
        promoList = window.navbar.issPromotions(3);
      });
    }

    // deprecated - retained only for backwards compatibility
    function initStatic(sb, form, valInput, submit, submitImg, names, values, noMatch, ime, multiword, dummy0) {
      init({
        form: form,
        ime: ime,
        multiword: multiword,
        noMatch: noMatch,
        sb: sb,
        src: [ names, values ],
        submit: submit,
        submitImg: submitImg,
        valInput: valInput
      });
    }

    // deprecated - retained only for backwards compatibility
    function initDynamic(sb, form, dd, service, mkt, aliases, handler, deptText, sugText, sc, dummy0) {
      init({
        aliases: aliases,
        dd: dd,
        deptText: deptText,
        form: form,
        handler: handler,
        ime: (mkt == 6 || mkt == 3240),
        mkt: mkt,
        sb: sb,
        sc: sc,
        src: service,
        sugText: sugText
      });
    }

    // Lookup $(h[k]); if it exists, replace h[k] with it; otherwise, delete h[k]
    function lookup(h,k,n) {
      if (n = h[k]) {
        n = $(n);
        if (n && n.length) {
          h[k] = n;
          return n;
        }
      }
      delete h[k];
    }

    // Set the disabled state of the form submit.
    function disable(d) {
      // pick between prop() in jQuery 1.6.4 and attr() in jQuery 1.2.6:
      if (opt.submit.prop) {
        opt.submit.prop('disabled', d);
      } else {
        // TODO: when the jQuery 1.6.4 is dialed up to 100%, remove the attr() call
        opt.submit.attr('disabled', d);
      }
    }

    // Search box event handler: adjust
    function move(n) {
      if (curSize <= 0) {
        return;
      }

      try {
        unhighlightCurrentSuggestion();

        if (n > 0 && crtSel >= curSize - 1) {
          crtSel = -1;
        } else if (n < 0 && crtSel < 0) {
          crtSel = curSize - 1;
        } else {
          crtSel += n;
        }
        highlightCurrentSuggestion(true);
      } catch(e) {
        // Beware swallowed errors here.
        // console.log(e);
      }
    }
    
    // Function to warp a variable around some range
    // Min and max are the range of values for x, if x passes outside
    // this range it is 'wrapped' around to the opposisite extreme
    function wrap(x, min, max) {
      return x > max ? min : (x < min ? max : x);
    }
    
    // this is the handler for arrow keys in two pane
    function twoPaneArrowKeyHandler(e) {
      var key = e.keyCode
        , list = twoPaneSuggestionsList
        , mainLength = list.length
        , xcatLength = list[crtSel] && list[crtSel].xcat ? list[crtSel].xcat.length : 0
        , ssNode = searchSuggest.getNode()
        , n
        , crtSelId
        , xcatSelId
        , firstId = opt.sugPrefix + 0;
      
      if (e.ctrlKey || e.altKey || e.shiftKey) {
        // assume all keypresses that come with modifiers are not for navigation
        return;
      }

      switch(key) {
        case 38: // arrow up: navigate up in the appropriate list
        case 40: // arrow down: navigate down in the appropriate list
          n = key === 38 ? -1 : 1;
          if (crtSel > -1 && crtXcatSel >= 0) {
            crtXcatSel = wrap(crtXcatSel + n, 0, xcatLength - 1);
          }
          else {
            crtSel = wrap(crtSel + n, -1, mainLength - 1);
          }
          break;
        case 37: // arrow left: move to the left list when not in the search box
        case 39: // arrow right: move to the right list (if it exists) when not in the search box
          if (crtSel <= -1) {
            return; // allow default action
          }
          if (key === 39 && crtXcatSel <= -1 && xcatLength > 0) {
            crtXcatSel = 0;
          }
          else if (key === 37) {
            crtXcatSel = -1;
          }
          break;
        default:
          return; //do nothing with other keys
      }
      
      crtSelId = opt.sugPrefix + crtSel;
      xcatSelId = opt.sugPrefix + crtSel + '-' + crtXcatSel;
      
      // the special hint class is only ever added to the first element and can be removed on the first event
      ssNode.find('#' + opt.sugPrefix + '0').removeClass('xcat-arrow-hint');

      // starting at searchSuggest node means there is less DOM to search with the selector to find visible nodes:
      ssNode.find(".main-suggestion").each(function (i, el) {
        var e = $(el);
        if (el.id === crtSelId) {
          e.addClass('suggest_link_over');
          ssNode.find('#xcatPanel-' + i).show().find('.xcat-suggestion').each(function (i, el) {
            var e = $(el);
            if (el.id !== xcatSelId) {
              e.removeClass('suggest_link_over');
            }
            else {
              e.addClass('suggest_link_over');
            }
          });
        }
        // in the case where focus returned to the search box
        else if (crtSel <= -1 && el.id === firstId) {
          e.removeClass('suggest_link_over');
          // add special hint class back so arrow is visible while focus is in the search box
          ssNode.find('#' + opt.sugPrefix + '0').addClass('xcat-arrow-hint');
          // display the first x-cat panel
          ssNode.find('#xcatPanel-0').show().find('.xcat-suggestion').removeClass('suggest_link_over');
        }
        else {
          // hide side panels for items we are not over
          e.removeClass('suggest_link_over');
          ssNode.find('#xcatPanel-' + i).hide();
        }
      });
      
      updateCrtSuggestion();
      
      // Because we considered the input something we should handle we want to 
      // prevent the cursor from moving around in the search box
      e.preventDefault();
      return false;
    }

    // Promotion box event handler: show promotions
    function clickHandler(kw) {
      if (!kw.length) {
        displayPromotions();
      }
    }

    // Search box event handler: hide
    function hideSuggestions() {
      // Don't hide when IME may be in use, because the Enter key might signify IME commit.
      // TODO: The reasoning behind appears to be incorrect. Customers may use IME on any site
      // (we see Chinese/Japanese/Korean/etc. searches on all sites). There may also be interaction
      // with screen readers.
      !opt.ime && hideSuggestionsDiv();
    }

    // Search box event handler: dismiss
    function dismissSuggestions() {
      // if (searchSuggest.visible()) { //PCOSTA disabled this function
      //   // Warning: this timeout is really necessary. If the user clicks on a suggestion and we hide the UI immediately
      //   // in onBlur the click event will never fire on the suggestion.
      //   hideDelayTimerId = setTimeout(function() {
      //     return (function() {
      //       hideDelayTimerId = null;
      //       hideSuggestionsDiv();
      //      });
      //    }(), 300);
      //   // TODO: It seems like these should be in the timeout.
      //   crtSel = -1;
      //   if (suggType == 'sugg') {
      //     updateCrtSuggestion();
      //   }
      //   return false;
      // }
      
      return true;
    }

    // Search box event handlers: update
    // Text has changed, start computing new suggestions
    function update(kw) {
      suggestionList = [];
      twoPaneSuggestionsList = [];
      if (!kw.length) {
        displayPromotions();
        
        // clear the inline auto complete
        if (inlineAutoComplete) {
            inlineAutoComplete.clear();
        }
      } else {
        first = -1;
        if (opt.multiword){
          findSeq();
        } else {
          findBin();
        }
        curSize = suggestionList.length;
        displaySuggestions(kw);
        checkForExactMatch();
        checkForManualOverride();
      }
      timer = null;
      crtSel = -1;
      crtXcatSel = -1;
    }
    
    function delayUpdate(kw) {
      var then = now(),
          newImeEnhUsed = searchBox.isImeEnhUsed();
      
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      timer = setTimeout(function() {
        // clear inline auto complete
        if (inlineAutoComplete) {
            inlineAutoComplete.clear();
        }
        return (function() {
          if (!kw || !kw.length) {
            displayPromotions();
          }else{
            opt.imeEnh ? searchJSONSuggest(kw, newImeEnhUsed) : searchJSONSuggest();
          }
          timer = null;
          crtSel = -1;
          crtXcatSel = -1;
        });
      }(), defaultTimeout);
    }

    // Search box event handler: submitEnabled
    function submitEnabled() {
      // We will disable submit when some promotion is selected so redirect can happen
      if (suggType == "promo" && crtSel > -1) {
        document.location.href = promoList[crtSel].href;
        return false;
      }

      var s = opt.submit;
      // Jquery 1.6.4 supports .prop() while 1.2.6 support attr(). We have to pick between these methods while we transition to jQuery 1.6.4.
      // TODO: when the jquery version of search page update to 1.6.4 or higher, remove the attr() method
      if (s) {
        return s.prop ? !s.prop('disabled') : !s.attr('disabled');
      }
    }

    // Search box event handler: keyPress
    function keyPress(key) {
      keystroke && keystroke(key);
    }

    // iss.submit implementation
    function bindSubmit(handler) {
      // TODO: Make this work with the static case (which currently suppresses form submit)
      // and key logging (which installs its own submit handler that needs to run first).
      opt.form.submit(handler);
    }

    // iss.keypress implementation
    function bindKeypress(handler) {
      keystroke = handler;
    }

    // iss.suggest implementation
    function bindSuggest(handler) {
      sugHandler = handler;
    }

    // wrapper around any caller provided normalize or to provide default normalization otherwise
    function normalize(s) {
      if (opt.normalize) {
        return opt.normalize(s);
      } else {
        return s.toLowerCase();
      }
    }

    // Binary search through the ordered list of names
    function findBin() {
      var low = 0
        , high = names.length - 1
        , mid = -1
        , dataPrefix =''
        , crtPrefix = normalize(keyword())
        , len = crtPrefix.length;

      while (low <= high) {
        mid = Math.floor((low + high) / 2);

        dataPrefix = normalize(names[mid]).substr(0, len);

        if (dataPrefix < crtPrefix) {
          low = mid + 1;
        } else {
          high = mid - 1;
          if (dataPrefix == crtPrefix) {
            first = mid;
          }
        }
      }

      if (first != -1) {
        var i = first
          , n;

        do {
          suggestionList.push({ keyword: names[i], i: i });
          ++i;
        } while (suggestionList.length < opt.maxSuggestions && (n = names[i]) && !normalize(n).indexOf(crtPrefix));
      }
    }

    function findSeq() {
      var crtPrefix = normalize(keyword())
        , rexp = new RegExp("(^|(?:\\s))"+ crtPrefix, "i")
        , i = 0
        , len = names.length
        , n;
      for (; i < len && suggestionList.length < opt.maxSuggestions; i++) {
        n = names[i];
        if (normalize(n).match(rexp)) {
          suggestionList.push({ keyword: n, i: i});
          if (first == -1) {
            first = i;
          }
        }
      }
    }

    function checkForExactMatch() {
      var state = 'disabled';
      if (curSize) {
        var sg = normalize(suggestionList[0].keyword)
          , kw = normalize(keyword());
        if (sg.length == kw.length && !getPrefixPos(sg, kw)) {
          updateForm(first);
          state = '';
        }
      }
      disable(state);
    }

    // Optionally allow user to enter keyword that is not in suggestion list
    function checkForManualOverride() {
      if (opt.manualOverride && !curSize) {
        var kw = keyword();
        var url = opt.manualOverride(kw);
        if (url && url.length) {
          updateWholeForm(url);
          disable('');
        }
      }
    }

    // display promotions
    function displayPromotions() {
      if (!newDesign || !promoList || promoList.length == 0) {
        hideSuggestionsDiv();
        hideNoMatches();
        return;
      }

      curSize = promoList.length;
      suggType = "promo";
      searchSuggest.html('');
      hideNoMatches();
      searchSuggest.show();
      h = '<ul class="promo_list">';
      for ( i = 0; i < curSize; i++) {
        p = promoList[i];
        h += '<li id="' + opt.sugPrefix + i + '" onclick="document.location.href=\'' + p.href + '\'">';
        h += '<div class="promo_image" style="background-image: url(\''+ p.image + '\');"></div>';
        h += '<div class="promo_cat">' + p.category + '</div>';
        h += '<div class="promo_title">' + p.title + '</div>';
        h += '</li>';
      }
      h += '</ul>';
      searchSuggest.html(h);
      window.navbar.logImpression("iss");

      for (i = 0; i < curSize; ++i) {
        $("#" + opt.sugPrefix + i).mouseover(suggestOver).mouseout(suggestOut);
      }
    }
    
    function displaySuggestions(crtPrefix) {
      var sugDivId
        , lineText
        , line
        , sPrefix = opt.sugPrefix
        , prefix = "#" + sPrefix
        , h = ''
        , imeSpacing = opt.imeSpacing && searchBox.isImeUsed()
        , currAlias = searchAlias() || (opt.deepNodeISS && opt.deepNodeISS.searchAliasAccessor())
        , suggType = 'sugg'
        , i;
      // TODO: Use jQuery DOM manipulation here instead of innerHTML and string concats.
      searchSuggest.html('');

      if (curSize > 0) {
        hideNoMatches();
        searchSuggest.show();
        if (!staticContent && !newDesign) {
            h += '<div id="sugdivhdr" align="right"> ' + opt.sugText + '</div>'; //Remove HTML aligment after 'I' deployment : https://tt.amazon.com/0008345565, SEP-4015
        }
        
        // add inline auto completion in search box.
        if (opt.iac && inlineAutoComplete.displayable()) {
          var sg = normalize(suggestionList[0].keyword)
            // should not trim the original keywords
            , originalKw = opt.sb.val()
            , normalizedKw = normalize(keyword());
          if (normalizedKw.length > 0 && sg != normalizedKw && sg.indexOf(normalizedKw) == 0) {
              // Rather than using sg directly , we should append the auto completed characters to the keywords the customer has typed.
              inlineAutoComplete.val(originalKw + sg.substring(normalizedKw.length));
          }
        }
        
      } else {
        showNoMatches();
      }

      for (i = 0; i < curSize; i++) {
        line = suggestionList[i];
        sugDivId = sPrefix + i;
        if (line.alias && line.alias == currAlias && opt.deepNodeISS && opt.deepNodeISS.showDeepNodeCorr) {
          // we're doing deep node ISS and we're bouncing the user to the top-level alias and we want to show that correction
          lineText = getFormattedCategoryLine(line, crtPrefix);
        } else if (line.alias && line.alias != currAlias) {
          // normal xcat suggestion
          lineText = getFormattedCategoryLine(line, crtPrefix);
        }
        else {
          // suggestion w/o category text (possibly a deep node ISS correction to the top-level alias but we're not displaying the correction)
          lineText = getFormattedSuggestionLine(line, crtPrefix);
        }
 
        var className = "suggest_link";
        // add the spacing for the first suggestion
        if (i == 0 && imeSpacing) {
          className += " imeSpacing";
        }
        h += '<div id="'+ sugDivId + '" class="' + className + '">' + lineText + '</div>'; //Remove HTML aligment after 'I' deployment : https://tt.amazon.com/0008345565, SEP-4015
        if(enableSeparateCategorySuggestion() && i == categorySuggestions && (i < curSize -1)) {
          h += '<div class="sx_line_holder" />';
        }
      }

      if (curSize > 0 && !newDesign) {
        h += '<div id="sugdivhdr2" align="right">&nbsp;</div>';
      }

      h && searchSuggest.html(h);

      //Since suggestions box was just displayed, capture the user perceived latency
      if(timeToFirstSuggestion == 0 && suggestionList.length > 0) {
         recordTimeToFirstSuggestion();
      }

      // Save the original category dropdown value
      if (ddBox) {
        defaultDropDownVal = ddBox.val();
      }

      searchAliasFrom = extractSearchAlias(defaultDropDownVal);

      for (i = 0; i < curSize; ++i) {
        // TODO: When we switch to jQuery 1.4, replace these with a single bind.
        // TODO: Instead of looking up IDs here, cache the nodes above when created.
        $(prefix + i).mouseover(suggestOver).mouseout(suggestOut).click(setSearchByIndex);
      }
    }
    
    function displayTwoPaneSuggestions(crtPrefix){
      var len = crtPrefix.length
        , i, j, k
        , sg
        // we need to know if this is IE6 for nav sprite override
        , isIe6 = $.browser.msie && $.browser.version=="6.0"
        , targetOffset
        , sb = []  // string buffer
        , a = function () { $.each(arguments, function(i, t) { sb.push(t); }); }  // appender fuction
        , sgLen = twoPaneSuggestionsList.length
        , xcatLen
        , maxXcatLen = 0
        , imeSpacing = opt.imeSpacing && searchBox.isImeUsed()
        , ssNode;
        
        $($.find('.main-suggestion:first')).amznFlyoutIntent('destroy');
        
        if (curSize > 0) {
          hideNoMatches();
          
          // add inline auto completion in search box.
          if (opt.iac && inlineAutoComplete.displayable()) {
            var sg = normalize(twoPaneSuggestionsList[0].keyword)
              // should not trim the original keywords
              , originalKw = opt.sb.val()
              , normalizedKw = normalize(keyword());
            if (normalizedKw.length > 0 && sg != normalizedKw && sg.indexOf(normalizedKw) == 0) {
              // Rather than using sg directly , we should append the auto completed characters to the keywords the customer has typed.
              inlineAutoComplete.val(originalKw + sg.substring(normalizedKw.length));
            }
          }
          
          //preamble
          a('<table id="two-pane-table" class="', isIe6 ? 'nav_ie6' : 'nav_exposed_skin', '" cellpadding="0" cellspacing="0">',
              '<tr>',
                '<td class="iss_pop_tl nav_pop_h"><div class="nav_pop_lr_min"></div></td>',
                '<td style="background-color: #fff;" colspan="2"></td>',
                '<td class="iss_pop_tr nav_pop_h"></td>',
              '</tr>',
              '<tr>',
                '<td class="nav_pop_cl nav_pop_v"><div class="nav_pop_lr_min"></div></td>'
           );
          var className = "main-suggestions";
          // add the padding for the left pane
          if (imeSpacing) {
            className += " imePadding";
          }
          a('<td class="' + className + '" >');
          
          for (i = 0; i < sgLen; i++) {
            a('<div id="', opt.sugPrefix, i, '" class="suggest_link main-suggestion');
            if (i === 0) {
              a(' xcat-arrow-hint');
            }
            a('"><span>');
            sg = twoPaneSuggestionsList[i];
            xcatLen = sg.xcat.length;
            
            if (xcatLen) {
              a('<span class="nav-sprite nav-cat-indicator xcat-arrow"></span>');
              if (maxXcatLen < xcatLen) {
                maxXcatLen = xcatLen;
              }
            }
            a(getFormattedSuggestionLine(sg, crtPrefix), '</span></div>');
          }

          // add padding rows so the main suggestions area is at least as tall as the largest x-cat suggestions list
          for (i = 0; i < (maxXcatLen - sgLen); i++) {
            a('<div class="iss-spacer-row">&nbsp;</div>');
          }
          
          // this line puts the split in split-pane
          var className = "xcat-suggestions";
          // add the padding top for the right pange
          if (imeSpacing) {
            className += " imePadding";
          }
          a('</td><td class="' + className + '">');
          
          for (i = 0; i < sgLen; i++) {
            sg = twoPaneSuggestionsList[i];
            // this is the two pane panel:
            a('<div id="xcatPanel-', i, '" class="xcat-panel"');
            if (i > 0) {
              a(' style="display:none"');  // hide all but the first panel
            }
            a('>');
                  
            for (j = 0; j < sg.xcat.length; j++) {
              a('<div id="', opt.sugPrefix, i, '-', j, '" class="suggest_link xcat-suggestion',
                  j === 0 ? ' xcat-suggestion-hint' : '' ,'">', sg.xcat[j].categoryName, '</div>');
            }
            a('</div>');
          }
          
          // post script:
          a(    '</td>',
                '<td class="nav_pop_cr nav_pop_v"></td>',
              '</tr>',
              '<tr>',
                '<td class="nav_pop_bl nav_pop_v"></td>',
                '<td colspan="2" class="nav_pop_bc nav_pop_h"></td>',
                '<td class="nav_pop_br nav_pop_v"></td>',
              '</tr>',
            '</table>');
        }
        else {
          showNoMatches();
        }
        
        searchSuggest.html(sb.join(''));
        searchSuggest.show();
        // Since suggestions box was just displayed, capture the user perceived latency
        if(timeToFirstSuggestion == 0 && suggestionList.length > 0) {
           recordTimeToFirstSuggestion();
        }
        
        // Save the original category dropdown value
        if (ddBox) {
          defaultDropDownVal = ddBox.val();
        }
        searchAliasFrom = extractSearchAlias(defaultDropDownVal);
        
        // bind event handlers after the UI is on screen
        ssNode = searchSuggest.getNode()
        ssNode.find('.main-suggestion').bind('click', twoPaneSearchByIndex);
        ssNode.find('.xcat-suggestion').bind('click', twoPaneSearchByIndex)
                                       .bind('mouseover', twoPaneSuggestOver)
                                       .bind('mouseout', twoPaneXcatSuggestOut);
    }

    //compute time to first ISS suggestion from last keypress
    function recordTimeToFirstSuggestion() {
      var timeNow = now();
      //add 100ms for the time we wait after keyup and before firing off suggestion to ISS
      timeToFirstSuggestion = (timeNow - lastKeyPressTime) + defaultTimeout;
    }

    function showNoMatches() {
      if (opt.noMatch) {
        // Create an entry in the dropdown list showing No Matches found.
        var nmDiv = $('#' + opt.noMatch);
        searchSuggest.html('');
        searchSuggest.getNode().append(nmDiv.clone().attr('class','suggest_link suggest_nm').css({'display':'block'}));
        searchSuggest.show();

        // Disable the Submit Button by changing the image if one was provided
        opt.submitToggle && opt.submit.attr("src", opt.submitImg);
      } else {
          // simply hide the search suggestion div if there are no matches and no predefined nomatch treatment
         hideSuggestionsDiv();
      }
    }

    function hideNoMatches() {
      if (opt.noMatch) {
        $('#' + opt.noMatch).hide();
        opt.submitToggle && opt.submit.attr("src", opt.submitImgDef);
      }
    }

    // Click function
    function setSearchByIndex() {
      var divId = this.id;
      crtSel = parseInt(divId.substr(6), 10);

      updateCrtSuggestion();
      searchSuggest.hide();

      // clear the inline auto complete when searching by index
      if (opt.iac) {
        inlineAutoComplete.clear();
      }

      // In IE6 we may need to do the form submit in a callback so IE6 has the chance to update the DOM
      if (!delayedDOMUpdate) {
        opt.form.submit();
      } else {
        window.setTimeout(function() {
         opt.form.submit();
        }, 10);
      }
    }
    
    function twoPaneSearchByIndex(event) {
      var divId = this.id
        , prefixLen = opt.sugPrefix.length;
      
      crtSel = parseInt(divId.substr(prefixLen), 10);
      crtXcatSel = (divId.length === prefixLen + 1) ? -1 : parseInt(divId.substr(prefixLen + 2, 1), 10);
      event && event.stopPropagation();
      
      updateCrtSuggestion();
      // we can't simply hide the div here because under ajax this is not a page load
      // a full cleanup is needed
      $($.find('.main-suggestion:first')).amznFlyoutIntent('destroy');
      searchSuggest.hide();
      
      // clear the inline auto complete when searching by index
      if (opt.iac) {
        inlineAutoComplete.clear();
      }

      // In IE6 we may need to do the form submit in a callback so IE6 has the chance to update the DOM
      if (!delayedDOMUpdate) {
        opt.form.submit();
      } else {
        window.setTimeout(function() {
         opt.form.submit();
        }, 10);
      }
    }

    // Update the search box and the form.
    function updateCrtSuggestion() {
      var alias
        , categoryName
        , sg;
      
      // if an ISS suggestion is selected, update the display
      if (crtSel >= 0) {
        if (opt.twoPane === 1) {
          sg = crtXcatSel >= 0 ? twoPaneSuggestionsList[crtSel].xcat[crtXcatSel] : twoPaneSuggestionsList[crtSel];
        } else {
          if (redirectFirstSuggestion && crtSel == 0) {
            sg = suggestionList[1];
          } else {
            sg = suggestionList[crtSel];
          }
        }
        keyword(sg.keyword);
        alias = sg.alias;
        categoryName = sg.categoryName;
      }

      if (staticContent) {
        // set the form's value field.
        if (crtSel >= 0) {
          updateForm(sg.i);
          disable('');
        } else {
          checkForExactMatch();
          checkForManualOverride();
        }
      } else {
        updateCategoryDropDown(alias, categoryName);
        setDynamicSearch(sg);
      }
    }

    //hooking on to the form submit of the search box
    //to split the nb_sb_noss refmarker by whether iss was displayed or not
    opt.form && opt.form.submit(function() {
      var currentKeyword = normalize(keyword()),
          refTag = 'ref=nb_sb_noss',  // default refTag, no suggestions displayed
          i = 0;
      //clear the auto completed characters
      if (inlineAutoComplete) {
          inlineAutoComplete.clear();
      }
      // if the iacType is not 0, then customer is using it.
      var iacType = opt.iac ? inlineAutoComplete.type() : 0;
      if (iacType) {
        refTag = 'ref=nb_sb_iac_'+iacType;
      } else {
        // what is currently selected: ISS or the input field?
        if (crtSel > -1) {
          return;  // something in ISS is currently selected, don't change the refTag
        }
        
        // Input field is selected, were search suggestions were displayed?
        var sgList = opt.twoPane === 1 ? twoPaneSuggestionsList : suggestionList;
        if (sgList.length > 0) {
          refTag = 'ref=nb_sb_noss_2';  // assume implicit rejection of suggestions and then try to disprove it
          // does the search term match one of the ISS suggestions?
          while(i < sgList.length) {
            if(normalize(sgList[i].keyword) == currentKeyword) {
              refTag = 'ref=nb_sb_noss_1';
              break;     
            }
            i++;
          }
        }
      }
      
      // update the ref tag
      opt.form.attr('action', opt.form.attr('action').replace(refre, refTag));
    });

    // Update the reftag and sprefix fields for the search box request as a result of user interaction with the suggestion list.
    function setDynamicSearch(sg) {
      var prefixElems = $("#issprefix");
      // Update the ref tag
      if (sg) {
        // Put a different reftag if a category suggestion was selected
        var issMode
          , kw = searchBox.userInput();
        if (isFallbackSuggestion(sg)) {
          issMode = 'ss_fb';
        } else if (sg.alias) {
          issMode= 'ss_c';
        } else if (opt.sc && isSpellCorrection(sg)) {
          issMode = 'ss_sc';
        } else {
          issMode = 'ss_i';
        }

        setSearchFormReftag(opt.form, null, issMode, sg, kw.length);

        //Along with the sprefix, we will also send the searchAliasFrom and timeToFirstSuggestion
        kw = kw + "\," + searchAliasFrom + "\," + timeToFirstSuggestion;

        // Add a hidden field for passing the prefix that was used
        if (prefixElems.length) {
          prefixElems.attr("value", kw);
        } else {
          input(opt.form, "issprefix", "sprefix", kw);
        }
      } else {
        // Remove the hidden field for passing the prefix.
        prefixElems.remove();
      }
    }
    
    // Mouse over function
    function twoPaneSuggestOver() {
      var len = opt.sugPrefix.length,
          id = this.id,
          crtSelId = '#' + opt.sugPrefix + crtSel,
          xcatSelId,
          nextSel = parseInt(id.substr(len, 1), 10);
      
      this.style.cursor = 'pointer';
      $('.xcat-panel').hide();

      if (nextSel !== crtSel) {
        $(crtSelId).removeClass('suggest_link_over');
      }
      
      // the special hint class is only ever added to the first element and can be removed on the first event
      $('#' + opt.sugPrefix + '0').removeClass('xcat-arrow-hint');

      crtSel = nextSel;
      crtXcatSel = (id.length === len + 1) ? -1 : parseInt(id.substr(len + 2, 1), 10);
      crtSelId = '#' + opt.sugPrefix + crtSel;
      
      $(crtSelId).addClass('suggest_link_over');
      $('#xcatPanel-' + crtSel).show();
      
      if (crtXcatSel > -1) {
        $('#' + opt.sugPrefix + crtSel + '-' + crtXcatSel).addClass('suggest_link_over');
      }
    }

    // Mouse out function
    function twoPaneSuggestOut() {
      $(this).removeClass('suggest_link_over');
    }

    // Mouse out handler for two pane xcat suggestions
    function twoPaneXcatSuggestOut() {
      unhighlightSuggestion($(this));
    }
    
    // fixes the search dropdown location and width when it is displayed or when the window is resized
    function resizeHandler() {
      var p = searchBox.pos(),
          d = searchBox.size();
      
      this.css({
        width: d.width,
        top: p.top + d.height,
        left: p.left
      });
    }
    
    // bind the amznFlyoutIntent plugin
    function twoPaneBindFlyout() {
      searchSuggest.getNode().find('.main-suggestion').amznFlyoutIntent({
        onMouseOver: twoPaneSuggestOver,
        getTarget: function () { return $('#two-pane-table .xcat-suggestions:first'); }
      });
    }
    
    // destroy the amznFlyoutIntent plugin
    function twoPaneDestroyFlyout() {
      var mainSgs = searchSuggest.getNode().find('.main-suggestion').get(0);
      if (mainSgs) {
        $(mainSgs).amznFlyoutIntent('destroy');
      }
    }
    
    // set the location and width of the two-pane suggest UI
    function twoPaneSetPosition() {
      var p = searchBox.pos(),
          d = searchBox.size(),
          minWidth = 649;
        
      this.css({
        width: Math.max(d.width + 72, minWidth),
        top: p.top + d.height + 1,
        left: p.left - 40
      });
    }
    
    // set the top-margin on each cross category panel so it appears
    // adjacent to it's keywork suggestion if possible. If not it will
    // appear as far down as space permits.
    function twoPaneSetXcatPosition() {
      var maxH = this.find(".main-suggestions:first").height(),
          th = this.find('#' + opt.sugPrefix + '0').outerHeight(),
          sgLen = twoPaneSuggestionsList.length,
          i, h, xb, xh, off;
      
      // the 0th element doesn't need to be offset, so start at 1
      for (i = 1; i < sgLen; i++) {
        h = this.find('#' + opt.sugPrefix + i).outerHeight();
        xb = this.find('#xcatPanel-' + i);
        off = th;
        
        if (xb) {
          xb = $(xb)
          xh = xb.outerHeight();
          if (off + xh > maxH) {
            // we can't safetly offset the xcat panel by off so we have to make a correction:
            off = maxH - xh;
          }
          xb.css({'margin-top': off});
        }
        
        th += h; // acumulate the height of the suggestions
      }
    }
    
    // Mouse over function
    function suggestOver(event) {
      this.style.cursor = newDesign == true ? "pointer" : "default";
      unhighlightCurrentSuggestion();
      crtSel = parseInt(this.id.substr(opt.sugPrefix.length), 10);
      highlightCurrentSuggestion(false);
    }

    // Mouse out function
    function suggestOut(el, event) {
      unhighlightSuggestion($(this));
      crtSel = -1;
    }

    function highlightSuggestion(suggestion) {
      suggestion.addClass('suggest_link_over');
    }

    function unhighlightSuggestion(suggestion) {
      suggestion.removeClass('suggest_link_over');
    }

    function highlightCurrentSuggestion(updateSearchBox) {
      if (suggType == 'sugg'){
        updateSearchBox && updateCrtSuggestion();
      }
      highlightSuggestion($('#' + opt.sugPrefix + crtSel));
    }

    function unhighlightCurrentSuggestion() {
      unhighlightSuggestion($('#' + opt.sugPrefix + crtSel));
    }

    // Update the search dropdown with the current category
    function updateCategoryDropDown(alias, categoryName) {
      var dd = ddBox
        , toRemove
        , val;
 
      if (!dd) {
        return;
      }

      // Save this for later so it can be removed
      val = alias ? ('search-alias=' + alias) : defaultDropDownVal;

      // If it is the same value as the inserted one don't remove the one that we previusly inserted
      // Also if the previously inserted value has become the default value leave it there
      toRemove = (val == insertedDropDownVal || defaultDropDownVal == insertedDropDownVal) ? null : insertedDropDownVal;

      if (alias) {
        // If alias is not in the drop down we are going to add it and select it
        var sel = findOption(dd, val);
        insertedDropDownVal = null;
        if (!sel.length) {
          dd.append(option(val, categoryName));
          insertedDropDownVal = val;
        }
      }

      // IE6 will throw an exception if you try to set the value that you just added as it waits
      // to get control from JavaScript before updating the DOM. The value gets selected though.
      try {
        delayedDOMUpdate = false;
        // check for the presence of the new dropdown
        $(dcs).length && changeDropdownSelection(val, categoryName, true);
          dd.val(val);
      } catch(e) {
        // Beware swallowed errors here.
        // console.log(e);
        delayedDOMUpdate = true;
      }

      // Remove previously inserted value
      toRemove && findOption(dd, toRemove).remove();
    }

    // Returns the position of substr in str, using normalized matching.
    function getPrefixPos(str, substr) {
      if (opt.multiword) {
         return getPrefixPosMultiWord(str, substr);
      }
      return normalize(str).indexOf(normalize(substr));
    }

    // Returns the position of substr in str (excluding spaces), using normalized matching.
    function getPrefixPosMultiWord(str, substr) {
      var p = normalize(str).search(new RegExp("(^|(?:\\s))" + normalize(substr), "i"));
      // account for the space being searched for in the regex
      return p <= 0 ? p : p + 1;
    }

    // converts the keywords into HTML by bolding the prefix within the keywords
    function getFormattedSuggestionLine(curSuggestionLine, crtPrefix) {
      var kw = curSuggestionLine.keyword
        , start = getPrefixPos(kw, crtPrefix)
        , len;

      // if the prefix can be found within the string, do the formatting
      if (start !== -1) {
        len = crtPrefix.length;
        kw = [kw.substr(0, start), '<b>', kw.substr(start, len), '</b>', kw.substr(start + len)].join('');
      }
      
      return kw;
    }

    function getFormattedCategoryLine(categoryLine, crtPrefix) {
      var formattedCategoryLine,formattedCategoryName;
      if(opt.scs) {
        formattedCategoryLine = '<span class="suggest_category_without_keyword">';
        formattedCategoryName = '<span class="sx_category_name_highlight">' + categoryLine.categoryName + '</span>';
      } else {
        formattedCategoryLine = getFormattedSuggestionLine(categoryLine, crtPrefix) + ' <span class="suggest_category">';
        formattedCategoryName = categoryLine.categoryName;
      }
      return opt.deptText ? formattedCategoryLine 
                            + opt.deptText.replace(deptre, formattedCategoryName) 
                            + '</span>'
                          : categoryLine.categoryName;
    }

    function hideSuggestionsDiv() {
      // Cancel pending request
      if (suggType == 'sugg' && suggestRequest) {
        suggestRequest.cleanup();
        suggestRequest = null;
      }
      curSize = 0;
      $($.find('.main-suggestion:first')).amznFlyoutIntent('destroy');
      searchSuggest.hide();
      crtSel = -1;
      crtXcatSel = -1;
    }

    function updateWholeForm(v) {
      var fp = getFormParams(v);
      cleanForm();
      populateForm(fp);
    }

    function updateForm(index) {
      var v = values[index];
      if (opt.valInput && opt.valInput.length) {
        // update just one element of the form
        opt.valInput.attr("value", v);
      } else {
        // update the whole form
        updateWholeForm(v || location.href);
      }
    }

    // Parse the url and extract the uri and query params
    // Returns an object {uri=/gp/search/ref=sr_nr_p_4_0, formParams=[{name=n, value=123},...]}
    function getFormParams(url) {
      var splitUrl = url.split("?")
        , query = splitUrl.length > 1 ? splitUrl[1] : undefined
        , params = query ? query.split("&") : []
        , i = params.length
        , pair;
      while (i-- > 0) {
        pair = params[i].split("=");
        params[i] = { name: pair[0], value: pair[1].replace(slashre, ' ') };
      }

      return { uri: splitUrl[0], formParams: params };
    }

    // Remove all the form data
    function cleanForm() {
      opt.form.find(".frmDynamic").remove();
    }

    function populateForm(formData) {
      opt.form.attr("action", formData.uri);
      for (var i = 0; i < formData.formParams.length; i++) {
        var param = formData.formParams[i];
        input(opt.form, "frmDynamic", param.name, unescape(decodeURIComponent(param.value)), 1);
      }
    }

    // Get or set the current keyword in the search box.
    function keyword(k) {
      return searchBox.keyword(k);
    }

    // Get or set the current search alias in the dropdown.
    function searchAlias(alias) {
      if (alias) {
        changeDropdownSelection(alias);
      } else {
        return extractSearchAlias(ddBox.attr("value"));
      }
    }

    //retrieves the actual alias from ex : "search-alias=aps"
    function extractSearchAlias(alias) {
      var aliasName = alias.match(aliasre);
      return aliasName ? aliasName[1] : null;
    }

    // Get the currently selected node in the dropdown.
    function searchNode() {
      var nodeName = ddBox.attr("value").match(nodere);
      return nodeName ? nodeName[1] : null;
    }

    // Get the currently selected merchant in the dropdown.
    function merchant() {
      var merchant = ddBox.attr("value").match(merchantre);
      return merchant ? merchant[1] : null;
    }

    // Get the current suggestion list.
    function suggestions() {
      return suggestionList;
    }

    // TODO: Compute this just once, and then again on each dropdown change.
    function supportedSearchAlias(alias) {
      var a = opt.aliases;
      return a && arrayIndexOf(a,alias) >= 0;
    }

    // test if a suggestion is a Spell Correction
    // This gets used both to check the internal value which, is a boolean true or false AND
    // to check the value from A9 which is "1" or undefined. "1" is 'truthy' but not true.
    // The result of this function is always boolean true/false
    function isSpellCorrection(sg) {
      return sg && sg.sc ? true : false;
    }
    
    function isFallbackSuggestion(sg) {
      return (sg && sg.source && sg.source[0] == 'fb');  //TODO: scan the array when A9 starts sending multiple sources, right now it's always in [0]
    }

    // Make a combined list containing regular keyword suggestions and category suggestions
    function combineSuggestions(crtSuggestions, extraData) {
      var xcatSuggestions
        , m         // length of xcatSuggestions array
        , n = crtSuggestions.length
        , combinedList = []
        , i = 0   // the current index in crtSuggestions
        , j = 0   // the current index in crtCategorySuggestions
        , sg      // a suggestion
        , cs      // category suggestion
        , s       // category suggestion source flags array
        , si = 0  // catagory suggestion source flags array index
        , deepNodeAlias = // the top-level node above the deeper node that we're in
            (!searchAlias() && opt.deepNodeISS && !opt.deepNodeISS.stayInDeepNode && opt.deepNodeISS.searchAliasAccessor())
        , deepNodeCatName = deepNodeAlias && getDDCatName(deepNodeAlias) // the display name for the top-level node
      ;

      categorySuggestions = 0; //initialize the value before combine
      redirectFirstSuggestion = false; //initialize the value before combine
            
      // stop when we reach the end of the suggestion list or the combined list hits the maxSuggestions limit
      while (combinedList.length < opt.maxSuggestions && i < n) {
        // store the actual suggestion and spelling correction info
        sg = { keyword: crtSuggestions[i], sc: isSpellCorrection(extraData[i]), sgIndex: i };
        
        // add the top-level alias & its name
        // if we're doing deep node ISS and we're not just keeping people in that deep node
        if (deepNodeAlias && deepNodeCatName) {
          sg.alias = deepNodeAlias;
          sg.categoryName = deepNodeCatName;
        }

        combinedList.push(sg);
        
        // isolate the x-category suggestions array for this suggestion
        xcatSuggestions = (extraData && extraData.length ? extraData[i].nodes : []) || [];
        
        // pick up to the maximum of maxCategorySuggestions category suggestions for this suggestion
        m = xcatSuggestions.length;
        if (m) {
          // check if the main suggestion should be surpressed due to xcat source flag
          s = extraData[i].source;
          if (s && s.length) {
            for (si = 0; si < s.length; si++) {
              if (s[si] === "fb") {
                if (n == 1  && opt.scs) {
                  redirectFirstSuggestion = true
                } else {
                  combinedList.pop();
                }
                  
                break;
              }
            }
          }
          
          j = 0;
          while (j < m && j < maxCategorySuggestions && combinedList.length < opt.maxSuggestions) {
            cs = xcatSuggestions[j];
            sg = {
              keyword: crtSuggestions[i],
              sc: isSpellCorrection(extraData[i]),
              source: extraData[i].source,
              alias: cs.alias,
              categoryName: cs.name,
              sgIndex: i,
              xcatIndex: j
            };
            combinedList.push(sg);
            ++j;
            ++categorySuggestions;
          }
        }
        
        if (i == 0 && enableSeparateCategorySuggestion() && !redirectFirstSuggestion) {
          combinedList.push(combinedList[0]);
          opt.maxSuggestions += 1;
        }
        
        ++i;
      }

      curSize = combinedList.length;
      return combinedList;
    }
    
    //indicate whether or not to enable SeparateCategorySuggestion
    function enableSeparateCategorySuggestion() {
      return opt.scs && categorySuggestions > 0;
    }
    
    // returns the display name for the specified alias as found in the dropdown
    // or returns the currently displayed name if the alias argument is logically false
    function getDDCatName(alias) {
      if (!alias) {
        return $(ddBox.children()[0]).text();
      }
      var catName = findOption(ddBox, "search-alias=" + alias);
      if (catName && catName.length) {
        return catName.text();
      } else {
        return undefined;
      }
    }
    
    // Builds a two tiered structure more suitable for building HTML in the 2-pane treatment.
    // This also doesn't need special supression logic to deal with fallback cross category suggestions
    function build2PaneSuggestions(crtSuggestions, extraData) {
      var xcatSuggestions
        , xcat = []
        , m         // length of xcatSuggestions array
        , n = crtSuggestions.length
        , combinedList = []
        , i = 0   // the current index in crtSuggestions
        , j = 0   // the current index in crtCategorySuggestions
        , sg      // a suggestion
        , cs      // category suggestion
        , s       // category suggestion source flags array
        , si = 0  // catagory suggestion source flags array index
        , currAlias = searchAlias()                     // the current search alias - will be null when in a deep node
        , currCatName = getDDCatName(currAlias)         // display name for the current search alias
        , deepNodeAlias =                               // the top-level node above the deeper node that we're in 
            (!currAlias && opt.deepNodeISS              //   - false if we're not in a deep node or if we're staying in the deep node
              && !opt.deepNodeISS.stayInDeepNode 
              && opt.deepNodeISS.searchAliasAccessor())
        , deepNodeCatName = getDDCatName(deepNodeAlias) // display name for the deeper node we're in
      ;
      
      // stop when we reach the end of the suggestion list or the combined list hits the maxSuggestions limit
      while (combinedList.length < opt.maxSuggestions && i < n) {
        // isolate the x-category suggestions array for this suggestion
        xcatSuggestions = (extraData && extraData.length ? extraData[i].nodes : []) || [];
        xcat = [];
        
        // A9 is insisting that we add the current category as a suggestion. 
        // Hopefully later the server will do this fix-up
        sg = {
               keyword: crtSuggestions[i],
               sc: isSpellCorrection(extraData[i]),
               source: extraData[i].source || 'c',
               conf: extraData[i].conf,
               sgIndex: i,
               xcatIndex: 0
             };
        if (deepNodeAlias) {
          // we are bouncing to the top-level alias, so configure that for search & for display
          sg.alias = deepNodeAlias;
          sg.categoryName = deepNodeCatName;
        } else if (currAlias) {
          // code path when we're not in a deep node
          sg.alias = currAlias;
          sg.categoryName = currCatName;
        } else {
          // we're in a deep node but we're not bouncing out of it, so configure just for display
          sg.categoryName = deepNodeCatName;
        }
        xcat.push(sg);
        
        // pick up to the maximum of 10 category suggestions for this main suggestion
        m = xcatSuggestions.length;
        if (m) {
          j = 0;
          while (j < m && j < opt.maxSuggestions) {
            cs = xcatSuggestions[j];
            sg = {
              keyword: crtSuggestions[i],
              sc: isSpellCorrection(extraData[i]),
              source: extraData[i].source || 'c',
              alias: cs.alias,
              categoryName: cs.name,
              conf: extraData[i].conf,
              sgIndex: i,
              xcatIndex: j + 1  // off by 1 because we inserted the initial suggestion above
            };
            xcat.push(sg);
            ++j;
          }
        }
        
        // store the actual suggestion and spelling correction info
        sg = { keyword: crtSuggestions[i], sc: isSpellCorrection(extraData[i]), conf: extraData[i].conf, sgIndex: i,  xcat: xcat };
        if (deepNodeAlias) {
          // give the actual (in other words, the left-hand pane's suggestion) the top-level alias above the current deep-node
          sg.alias = deepNodeAlias;
        }
        combinedList.push(sg);
        ++i;
      }

      curSize = combinedList.length; // maybe this should be something else but for now its the length of the min list with xcats excluded
      return combinedList;
    }

    // Called from keyup on the search textbox. Starts the JSONP request.
    function searchJSONSuggest(newKw, newImeEnhUsed) {
      lastKeyPressTime = now();
      suggestRequest && suggestRequest.cleanup();

      // don't send any requests if iss activity is turned off
      if (!activityAllowed) {
        return;
      }

      // If searchBox does not have focus do not make any iss requests
      if (!searchBox.hasFocus()) {
        return;
      }
      var alias = searchAlias() || (opt.deepNodeISS ? opt.deepNodeISS.searchAliasAccessor() : null)
        , kw = newKw || keyword()
        , suggestUrl = []
        , a = function () { $.each(arguments, function(i, t) { suggestUrl.push(t); }); }
        , m = reqCounter === 0 ? metrics.completionsRequest0 : (reqCounter === metrics.sample ? metrics.completionsRequestSample : null)
        , cursorPos, qs;

      if (!supportedSearchAlias(alias)) {
        hideSuggestionsDiv(); // let's hide iss box before return.
        return; // save the service call since no suggestions will be forthcoming
      }

      if (opt.qs) {
        cursorPos = searchBox.cursorPos();
        if (cursorPos > -1 && cursorPos < kw.length) {
          qs = kw.substring(cursorPos);
          kw = kw.substring(0, cursorPos);
        }
      }

      a(opt.protocol, '//', opt.src, '?', 'method=completion',
       '&q=', encodeURIComponent(kw),
       '&search-alias=', alias,
       '&client=', opt.cid,
       '&mkt=', opt.mkt,
       '&fb=', opt.fb,
       '&xcat=', opt.xcat,
       '&x=updateISSCompletion');

      if (qs) {
        a('&qs=' + encodeURIComponent(qs));
      }
       
       if (opt.np) {
        a('&np=' + opt.np); 
       }

      if (opt.sc) {
        a('&sc=1');
      }

      if(opt.dupElim > 0) {
        a('&dr=', opt.dupElim);
      }

      if (opt.custIss4Prime) {
        a('&pf=1');
      }

      // if another request is ongoing, cleanup after it before starting the next request
      if (suggestRequest) {
        suggestRequest.cleanup();
      }

      // Save the A9 client object to teck the remote call, encapsulates the keywords
      suggestRequest = new A9JSONClient(kw, reqCounter++, newImeEnhUsed);
      
      // Metrics: log the beginning of the call to A9
      //if (m !== null && metrics.isEnabled) {
      //  uet('bb', m, {wb: 1});
      //}
      
      suggestRequest.callSuggestionsService(suggestUrl.join(''));
    }

    // JSON callback. This is called by the JSON response
    function updateCompletion() {
      // If the request has been canceled in the meantime don't show the suggestions
      if (!suggestRequest) {
        return;
      }

      // if iss requests have been invalidated via ajax etc, don't display the results of this call
      if (!activityAllowed || !completion.length || !completion[0] || !suggestRequest.keywords || completion[0].toLowerCase() != suggestRequest.keywords.toLowerCase()) {
        return;
      }
      
      imeEnhUsed = suggestRequest.imeEnhUsed;
      
      // metrics: log end of widget for selected metric
      var c = suggestRequest.counter,
          m = c === 0 ? metrics.completionsRequest0 : (c === metrics.sample ? metrics.completionsRequestSample : null);
      //if (m && metrics.isEnabled) {
      //  uet('be', m, {wb: 1});
      //  uex('ld', m, {wb: 1});
      //}
      
      // only cleanup when the request matches the response
      suggestRequest.cleanup();
      suggestRequest = null;

      // If searchBox does not have focus do not take any actions on the iss response.
      if (!searchBox.hasFocus()) {
        return;
      }

      // completion = prefix, suggestions, optional extra data
      
      // Read the categories and spelling correction data
      if (opt.twoPane === 1) {
        twoPaneSuggestionsList = build2PaneSuggestions(completion[1], (completion.length > 2) ? completion[2] : []);
        displayTwoPaneSuggestions(completion[0]);
        sugHandler && sugHandler(completion[0], twoPaneSuggestionsList);
      }
      else {
        suggestionList = combineSuggestions(completion[1], (completion.length > 2) ? completion[2] : []);
        displaySuggestions(completion[0]);
        sugHandler && sugHandler(completion[0], suggestionList);
      }
    }

    // signals autocomplete code to stop creating new iss requests and to stop expecting iss responses
    function stop() {
      activityAllowed = false;
      requestedKeyword = "";
      if (suggestRequest) {
        suggestRequest.cleanup();
        suggestRequest = null;
       }
    }

    // iss requests can now be sent
    function start() {
      activityAllowed = true;
    }

    // returns the name, value pair for the encoding magic string that is store in the form for some locales
    function encoding() {
      var encInput = opt.form.find("input[name^='__mk_']");
      if (encInput.length) {
        return [
          encInput.attr("name"),
          encInput.val()
        ];
      }
    }

    // ensures that the search bar is closed
    function blur() {
      searchBox.blur();
    }

    // Puts focus on the search bar
    function focus() {
      searchBox.focus();
    }

    // Returns the position of the search bar
    function offset() {
      return searchBox.pos();
    }

    // Attaches a keydown event handler to the search bar
    function keydown(h) {
      searchBox.keydown(h);
    }
    
    // Check the creation of inline auto complete 
    function checkIAC() {
      return inlineAutoComplete.touch();
    }
    
    //indicate whether or not use the ime enhancement feature
    function isImeEnhUsed() {
      return imeEnhUsed;
    }
    
    //trigger the ime enhancement weblab when
    //1.using the ime
    //2.the local is JP or CN
    //3.the browser is ie
    function triggerImeEnh() {
      return searchBox.isImeUsed() && opt.ime && $.browser.msie;
    }

    /* external API calls for AutoComplete */
    return {
      suggest: bindSuggest,
      keypress: bindKeypress,
      submit: bindSubmit,
      blur: blur,
      keyword: keyword,
      merchant: merchant,
      searchAlias: searchAlias,
      searchNode: searchNode,
      stop: stop,
      start: start,
      encoding: encoding,
      focus: focus,
      offset: offset,
      keydown: keydown,
      isImeEnhUsed: isImeEnhUsed,
      triggerImeEnh: triggerImeEnh,

      // SearchBox isn't always defined due to backwards compatibility issues
      onFocus: searchBox ? searchBox.onFocus : function(){},
      onBlur: searchBox ? searchBox.onBlur : function(){},
      cursorPos: searchBox ? searchBox.cursorPos : function() {return -1;},

      // DEPRECATED:
      // The following are for backward compatibility only, and can
      // be removed once all dependencies have been updated.
      initStaticSuggestions: initStatic,
      initDynamicSuggestions: initDynamic,
      updateAutoCompletion: updateCompletion,
      init: init
    };
};

// Get the current time.
function now() {
  return (new Date).getTime();
}

// No-op
function nop() {
}

// False
function suppress() {
  return false;
}

// Zero out an array.
function bzero(len, val) {
  var a = [];
  while (len--) {
    a.push(val);
  }
  return a;
}

// Find the first index in the array where the value occurs, or -1 if it's not there.
function arrayIndexOf(a,v) {
  for (var i = 0, len = a.length; i < len; i++) {
    if (a[i] == v) {
      return i;
    }
  }
  return -1;
}

// Append an <input> to a form.
function input(f,i,n,v,c) {
  f.append($('<input type="hidden"/>').attr(c ? "class" : "id",i).attr("name",n).attr("value",v));
}

// Construct an <option>.
function option(v,t) {
  return $("<option/>").attr("value", v).text(t);
}

// Return true if we should close the suggestion popup for this keypress.
function keyClose(w) {
  return w == 13 || w == 32;
}

// Find an option by its value in a DOM tree.
function findOption(d,v) {
  return d.find('option[value="' + v + '"]');
}

// Note the case difference below (uppercase I and lowercase i).
// Our version of jQuery doesn't reconcile the difference.
// http://www.weba11y.com/blog/2009/07/02/more-fun-with-the-tabindex-attribute/
function tabIndex(e,i) {
  return e.attr("tabIndex", i).attr("tabindex", i);
}

// Make a unique reftag suffix from an alias name.
// Attempts to ensure unique reftags for each alias name.
function getShortenedIDForOption(o) {
  var eq;
  if (!o || !o.length || (eq = o.indexOf("=")) == -1) {
    return '';
  }

  var alias = o.substr(eq + 1)
    , dash = alias.indexOf("-") + 1
    , shortID = alias.substr(0, 3);

  return dash ? shortID : (shortID + alias.charAt(dash));
}

// Change the JS-enabled dropdown selection in the nav bar.
function changeDropdownSelection(optionValue, selectedDisplayName, highlightOnly, option) {
  // TODO: Use the optional option passed in, or remove it.
  var dd = ddBox;

  // Category ISS: reset the selected value to APS
  if (optionValue == 'search-alias=aps' && !selectedDisplayName) {
    selectedDisplayName = findOption(dd, optionValue).text();
  }
  $('#' + sdpc).css("visibility", "hidden");
  $(dcs).text(selectedDisplayName);

  // Update the hidden select box
  dd.val(optionValue);
  if (!highlightOnly) {
    opt.sb.focus();

    // append dropdown reftags if needed
    setSearchFormReftag(opt.form, optionValue);
  }
}

// Updated the URL in the 'action' attribute of formElement with the appropriate ref tag
function setSearchFormReftag(formElement, optionValue, issMode, sg, numUserChars) {
  var formAction = formElement.attr('action')
    , isstag = (issMode != null && sg)
    , tag = isstag ? issMode + '_' +  sg.sgIndex + '_' + numUserChars
                   : 'dd_' + getShortenedIDForOption(optionValue);
  
  if (isstag || optionValue != null) {
    // append or replace the reftag as needed
    if (!refre.test(formAction)) {
      // always append if a reftag doesn't already exist
      if (formAction.charAt(formAction.length - 1) != '/') {
        formAction += '/';
      }
      formAction += tag;
    } else if (isstag && ddaliasre.test(formAction)) {
      // always append iss tags AFTER the dropdown tags if they already exist
      formAction = formAction.replace(ddaliasre, '$1_' + tag);
    } else {
      // in every other case, replace any existing reftag with the one we just computed
      formAction = formAction.replace(refre, 'ref=nb_sb_' + tag);
    }
    formElement.attr("action", formAction);
  }
}

// Cross site JSON client
function A9JSONClient(kw, counter, imeEnhUsed) {
  var fullUrl
    , noCacheIE
    , headLoc
    , scriptId
    , scriptObj
    , scriptCounter = counter || 0;

  function callService(url) {
    fullUrl = url;
    // Keep IE from caching requests
    noCacheIE = '&noCacheIE=' + now();
    headLoc = document.getElementsByTagName("head").item(0);
    scriptId = 'JscriptId' + scriptCounter;

    buildScriptTag();
    addScriptTag();
  }

  function buildScriptTag() {
    scriptObj = document.createElement("script");

    scriptObj.setAttribute("type", "text/javascript");
    scriptObj.setAttribute("charset", "utf-8");
    scriptObj.setAttribute("src", fullUrl + noCacheIE);
    scriptObj.setAttribute("id", scriptId);
  }

  function removeScriptTag() {
    try {
      headLoc.removeChild(scriptObj);
    } catch(e) {
      // Beware swallowed errors here.
      // console.log(e);
    }
  }

  function addScriptTag() {
    headLoc.appendChild(scriptObj);
  }

  return {
    callSuggestionsService: callService,
    cleanup: removeScriptTag,
    keywords: kw,
    counter: scriptCounter,
    imeEnhUsed: imeEnhUsed
  };
};

window.AutoComplete = AC;

// Metrics: log the end of the Autocomplete component being loaded as critical feature
if (metrics.isEnabled) {
  uet('cf', metrics.init, {wb: 1});  //timestamp body-end
}

})(window);

$SearchJS.publish('search-js-autocomplete-lib'); // TODO, switch this to $SearchJS.declare after 2013-K release
});

}