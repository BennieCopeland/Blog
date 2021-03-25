(function($) {
    "use strict"; // Start of use strict
    
    function fixCodeBlockAttributes() {
        // The Markdig engine applies attributes to the <code> tag
        // The PrismJS line highlighter requires this attribute to be on the <pre> tag 
        // copy data-line property for PrismJS from <code> tag to <pre> tag
        for (let element of document.getElementsByTagName('code')) {
            if (element.dataset['line']) {
                element.parentElement.dataset['line'] = element.dataset['line'];
            }
        }
    }

    function subvertingAngularUsingElmishPost() {
        const treeview = document.getElementById("subverting-angular-treeview");
        if (treeview) {
            const xpath = "//span[text()='elmish']";
            const n = document.evaluate(xpath, treeview, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (n) {
                n.setAttribute("style", "color: orange");
            }
        }
    }
    
    
    function runScripts() {
        fixCodeBlockAttributes();
        subvertingAngularUsingElmishPost();      
        
        
    }
    
    document.addEventListener('DOMContentLoaded', runScripts);
})(jQuery); // End of use strict