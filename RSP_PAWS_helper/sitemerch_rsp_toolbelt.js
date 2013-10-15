var d = document
    , i = 0
;

// add a global handler (on document) here
listen(d,'mouseover',listenerFunction);
listen(d,'click',listenerFunction);

setTimeout(heartbeat,1000);

function heartbeat(){
    eventFire(document.querySelector('#heartbeat'),'click');
    setTimeout(heartbeat,1000);
}


function eventFire(el, etype){
  if (el.fireEvent) {
    (el.fireEvent('on' + etype));
  } else {
    var evObj = document.createEvent('Events');
    evObj.initEvent(etype, true, false);
    el.dispatchEvent(evObj);
  }
}

function listenerFunction(e) {
        e = e || event;
        var originator = e.srcElement || e.target;
        if (/mouseover/i.test(e.type)) {
          if (/d2/.test(originator.id)) {
           i = i+1;
           originator.title='you hovered me ' +i +' time(s). Interesting!';
          } else if (/d1/.test(originator.id)) {
           originator.innerHTML = 'from global mouseover handler (#d2 was hovered: '+i+' time(s))<br />';
          }
        } 
        if (/click/i.test(e.type)) 
        {
          if (/d2/.test(originator.id)) {
            alert('you clicked #d2');
          } else if (/d1/.test(originator.id)) {
            originator.innerHTML = 'you clicked me!<br />';
          } else if (/heartbeat/.test(originator.id)){
             var tck = document.querySelector('#tick');
             tck.innerHTML = +(tck.innerHTML)+1;
          }
        }
}


function listen(el,etype,fn,nobubble,stopdefault){
            nobubble = nobubble || false;
            stopdefault = stopdefault || false;
            
            var fnwrap = function(e){
                  e = e || event;
                  if (nobubble) {
                    noBubbles(e);
                  }
                  if (stopdefault){
                    noDefault(e);
                  }
                  return fn.apply(el,Array.prototype.slice.call(arguments));
                }
            ;
            if (el.attachEvent) {
             el.attachEvent('on' + etype, fnwrap);
            } else {
             el.addEventListener(etype, fnwrap, false);
            }
}

function noDefault(e) {
            if (e.preventDefault){
              e.preventDefault();
            } else {
              e.returnValue = false;
            }
}

function noBubbles(e){
          if (e.stopPropagation){
              e.stopPropagation();

          } else {
              e.cancelBubble = true;
          }
}