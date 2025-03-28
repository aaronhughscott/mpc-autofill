function wrap0(idx, max) {
    // small helper function to wrap an index between 0 and max-1
    if (idx >= max) idx = 0;
    if (idx < 0) idx = max - 1;
    return idx;
}

function driveURL(driveID) {
    // small helper function to insert a drive ID into a thumbnail URL and return it
    return "https://drive.google.com/thumbnail?sz=w400-h400&id=" + driveID
    // return "https://lh3.googleusercontent.com/d/" + driveID + "=w400-h400";
}

function selectElementContents(el) {
    // TODO: this is a bit fucked atm
    // select all text in contentEditable
    // http://stackoverflow.com/a/6150060/145346
    let range = document.createRange();
    range.selectNodeContents(el);
    let sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function trigger_download(img_id) {
    // download an image with the given google drive ID
    let img_url = "https://drive.google.com/uc?id=" + img_id + "&export=download";

    let element = document.createElement('a');
    element.href = img_url;
    element.setAttribute('download', "deez.png");
    element.target = "_blank";

    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Card class - one for each face of each card slot
// contains logic to page between results, search again with new query, display correct stuff depending on results, etc.
class Card {
    constructor(cards, query, dom_id, slot, face, req_type, group, selected_img = null) {
        // array of card image obj's
        // each card image obj has properties: drive ID, name, source, DPI
        this.cards = cards;

        // other info
        this.query = query;
        if (query.length > 0 && query.toLowerCase().slice(0, 2) === "t:") {
            this.query = query.slice(2); 
            // TODO: req_type = token?
        }
        this.slot = slot;
        this.face = face;
        this.group = group;
        this.locked = false;
        this.img_idx = 0;
        this.img_count = cards.length;
        this.dom_id = dom_id;
        this.req_type = req_type;

        // store references to the card's html elements
        this.pe = document.getElementById(this.dom_id)
        this.elem_name = document.getElementById(this.dom_id + "-mpccard-name");
        this.elem_source = document.getElementById(this.dom_id + "-mpccard-source");
        this.elem_slot = document.getElementById(this.dom_id + "-mpccard-slot");
        this.elem_counter = document.getElementById(this.dom_id + "-mpccard-counter");
        this.elem_img = document.getElementById(this.dom_id + "-card-img");
        this.elem_prev = document.getElementById(this.dom_id + "-prev");
        this.elem_next = document.getElementById(this.dom_id + "-next");
        this.elem_padlock = document.getElementById(this.dom_id + "-padlock");
        this.elem_dl_button = document.getElementById(this.dom_id + "-dl-button");
        this.elem_dl_loading = document.getElementById(this.dom_id + "-dl-loading");

        // handy for updating the card later on
        this.empty = this.img_count === 0;

        // set up html elements to fit 1st card in set
        this.setup_card();

        if (selected_img !== "") {
            // switch to this image ID
            this.select_id(selected_img);
        }
    }

    get_curr_img() {
        // return the currently selected card object
        return this.cards[this.img_idx];
    }

    get_query() {
        // for retrieving the query to add to generated XML orders
        // if this card is a token, add "t:" to the query
        if (this.req_type === "token") return "t:" + this.query;
        else return this.query;
        // return this.query;
    }

    update_idx(n) {
        if (this.locked) {
            let this_group = groups[this.group];
            // determine the new idx for the group
            let new_idx = wrap0(this.img_idx + n, this.img_count);
            // for each element in the group, set its idx, then update it
            for (let i = 0; i < this_group.length; i++) {
                let this_obj = $('#' + this_group[i]).data("obj");
                this_obj.set_idx(new_idx);
                this_obj.update_card();
            }
        } else {
            // increment idx, then update the card
            this.img_idx += n;
            this.img_idx = wrap0(this.img_idx, this.img_count);
            this.update_card();
        }
    }

    set_idx(i) {
        this.img_idx = i;
        this.update_card();
    }

    // functions called by buttons on the Card - next, prev, download, lock - are executed in the context of the button,
    // so these functions are wrappers for object methods
    next() {
        // $(this.parentElement).data("obj").select_fwd();
        $(this.parentElement).data("obj").update_idx(1);
        return false;
    }

    prev() {
        $(this.parentElement).data("obj").update_idx(-1);
        return false;
    }

    download() {
        $(this.parentElement.parentElement).data("obj").download_image();
        return false;
    }

    lock() {
        $(this.parentElement.parentElement).data("obj").toggle_lock();
        return false;
    }

    download_image() {
        // TODO: hitting download while the order is loading in stops any further cards from loading in
        // show loading wheel until the image starts downloading
        this.elem_dl_loading.style.display = "inline";
        this.elem_dl_button.style.display = "none";

        trigger_download(this.get_curr_img().id);

        // TODO: wait for image to download instead? idk how to do that - so I'm just waiting for 3 seconds instead
        setTimeout($.proxy(function () {
            this.elem_dl_loading.style.display = "none";
            this.elem_dl_button.style.display = "inline";
        }, this), 3000);

    }

    toggle_lock() {
        // toggle locking for this card's group
        let this_group = groups[this.group];
        let new_state = !this.locked;

        for (let i = 0; i < this_group.length; i++) {
            let this_elem = $('#' + this_group[i]);
            this_elem.data("obj").set_lock(new_state);
        }
    }

    set_lock(new_state) {
        // toggle this card between locked and unlocked
        this.locked = new_state;
        let unicode_locked = '<i class="bi bi-lock"></i>';
        let unicode_unlocked = '<i class="bi bi-unlock"></i>';
        if (this.locked) {
            this.elem_padlock.innerHTML = unicode_locked;
            this.elem_padlock.style.textShadow = "0px 0px 5px black, 0px 0px 5px black, 0px 0px 5px black";
        } else {
            this.elem_padlock.innerHTML = unicode_unlocked;
            this.elem_padlock.style.textShadow = "none";
        }
    }

    select_id(driveID) {
        // select the result for this card with the given drive ID
        // idk, that's shit english but you get what I mean man
        for (let i = 0; i < this.cards.length; i++) {
            if (this.cards[i].id === driveID) {
                // switch to this index
                this.set_idx(i);
                return;
            }
        }

        // if we didn't return from the function by this point, the version wasn't found
        cards_not_found.push({
            id: driveID,
            query: this.query,
            slot: this.slot + 1
        })
    }

    setup_card() {
        // enable or disable static visual elements - left/right arrows, padlock, slot number at top
        if (this.req_type === "back") {
            this.locked = true;
            this.group = 1;
            this.elem_padlock.style.display = "none";
            if (this.slot === "-") {
                // common cardback on right panel
                this.elem_slot.innerHTML = "Cardback";
                // also disable the padlock for the common cardback (it's always locked) and searching in-place
                this.elem_padlock.style.display = "none";
                this.elem_name.setAttribute("contentEditable", "false");
            } else {
                // cardbacks on the backs of other cards (left panel)
                this.elem_dl_button.style.visibility = "hidden";
                this.elem_prev.style.visibility = "hidden";
                this.elem_next.style.visibility = "hidden";
                this.elem_counter.style.visibility = "hidden";

                // set this cardback's idx to the common cardback's id
                this.img_idx = $("#slot--back").data("obj").img_idx;
            }
        } else {
            this.elem_prev.style.visibility = "visible";
            this.elem_next.style.visibility = "visible";
            this.elem_counter.style.visibility = "visible";

            this.elem_name.setAttribute("contentEditable", "true");
        }

        // set slot number - the common cardback (right panel) is handled slightly differently
        if (this.slot !== "-") {
            this.elem_slot.innerHTML = "Slot " + (parseInt(this.slot) + 1).toString();
        }

        // add onclick functions to buttons
        if (!this.empty) {
            // download button active
            this.elem_dl_button.onclick = this.download;
            this.elem_prev.onclick = this.prev;
            this.elem_next.onclick = this.next;

            // group button active
            if (this.group > 1) {
                this.elem_padlock.onclick = this.lock;
            } else {
                this.elem_padlock.style.display = "none";
            }

            // enable the dl button in case it was previously disabled
            this.elem_dl_button.style.display = "";
        } else {
            // left/right buttons, as well as dl button and padlock, should be invisible
            this.elem_padlock.style.display = "none";
            this.elem_dl_button.style.display = "none";
            if (this.face === "back") {
                // no results found, and this card is a back face, meaning we should use the common cardback
                // only search again if this Card isn't being instantiated by a search for a cardback
                // i.e. when no cardbacks are found, this check will avoid recursively triggering ajax queries
                search_api(drive_order, "", [this.slot, ""], "back", this.dom_id, "back")
                groups[1].push(this.dom_id);
            } 
        }

        // hide left/right buttons if no results or only one result
        if (this.img_count <= 1) {
            this.elem_prev.style.display = "none";
            this.elem_next.style.display = "none";
        } else {
            this.elem_prev.style.display = "inline";
            this.elem_next.style.display = "inline";
        }

        // attach this object to the parent element
        $(this.pe).data("obj", this);

        // event listener on cardname edit to research
        $(this.elem_name).unbind("keydown"); // to remove previously added keydown event listeners, otherwise they can stack
        $(this.elem_name).keydown(function (e) {
            if (e.keyCode === 13) {
                let search_query = this.innerText;
                let parent_elem = this.parentElement.parentElement;
                // animating the opacity instead of using fadeOut so things stay in place
                $(parent_elem).css("pointer-events", "none");
                $(parent_elem).animate({opacity: 0}, 250, function () {
                    // first, if this card is in a lock group, remove it from the group
                    let card_obj = $(this).data("obj");
                    if (card_obj.group > 0) {
                        // attempt to yeet this id out of the group
                        // using the top rated javascript answer of all time on stackoverflow haha
                        let id_idx = groups[card_obj.group].indexOf(this.id);
                        if (id_idx > -1) {
                            groups[card_obj.group].splice(id_idx, 1);
                        }
                    }
                    search_api(drive_order, search_query, [parseInt(card_obj.slot), ""], card_obj.face, card_obj.dom_id, "normal", 0);
                });
                return false;
            }
        });

        // de-focus the query div
        $(this.elem_name).blur();
        window.getSelection().removeAllRanges();

        this.update_card();

        // wait for first image to complete loading before fading in
        $(this.elem_img).load(function () {
            let parent_elem = this.parentElement.parentElement;
            if (parent_elem.style.opacity === "0") {
                // animating the opacity instead of using fadeIn so things stay in place
                $(parent_elem).css("pointer-events", "auto");
                $(parent_elem).animate({opacity: 1}, 250)
            }
        })
    }

    update_card() {
        // update visual elements that change between image variants
        let curr_title = this.query;
        let curr_source = "Your Search Query";

        if (!this.empty) {
            // some search results were found - use info from currently selected image variant
            curr_title = this.get_curr_img().name;
            curr_source = this.get_curr_img().source + " [" + this.get_curr_img().dpi.toString() + " DPI]";

            let elem_img_prev = document.getElementById(this.dom_id + "-card-img-prev");
            let elem_img_next = document.getElementById(this.dom_id + "-card-img-next");

            // load the previous and next images for a smooth slideshow
            // keep them loaded by changing the src of visible img elements, but they sit behind the main
            // element due to z-index
            let buffer_id = this.cards[wrap0(this.img_idx, this.img_count)].id;
            this.elem_img.src = driveURL(buffer_id);

            // respect the length of the returned results
            if (this.img_count > 1) {
                buffer_id = this.cards[wrap0(this.img_idx - 1, this.img_count)].id;
                elem_img_prev.src = driveURL(buffer_id);

                if (this.img_count > 2) {
                    buffer_id = this.cards[wrap0(this.img_idx + 1, this.img_count)].id;
                    elem_img_next.src = driveURL(buffer_id);
                }
            }
        } else {
            // no search results - update image src to blank image
            this.elem_img.src = "https://mpcautofill.com/static/cardpicker/blank.png";
        }

        // update image name
        this.elem_name.innerHTML = curr_title;

        // update source and dpi
        this.elem_source.innerHTML = curr_source;

        // update selected image/total
        this.elem_counter.innerHTML = (this.img_idx + 1).toString() + "/" + this.img_count.toString();
    }
}
