	var snapCategoryWidgetVD = function() {
		var ff = jQuery("#homepage_shops");
		
		
		// if we aren't able to determine a width yet, recursively re-call this function again with a 10ms delay
		if (ff.width() == 0) {
			setTimeout(function() { snapCategoryWidgetVD(); }, 10);
			return;
		}
		// set the minimum gutter between tiles to 18px
		var minGutter	= 18;
		
		// find <tr>s within the stretchy table and iterate through each one
		ff.find("tr").each(function() {
			// set width equal to either the width of the table element, or the body width excluding width of the left navigation
			var width	= Math.min(ff.width(), jQuery('body').width() - 180);
			// n is equal to the number of tiles that can display at the given width
			var n		= Math.floor(width / (180 + minGutter));
			
			// iterate through each td, showing those that width prevents and hiding the remaining
			jQuery(this).find("td").each(function(i){
				if (i < n || i < 4) {
					jQuery(this).show();
				} else {
					jQuery(this).hide();
				}
			});
		});
	}

	// call the function immediately
	snapCategoryWidgetVD();
	
	// call the function on any window resize event
	jQuery(window).resize(function() { snapCategoryWidgetVD(); });