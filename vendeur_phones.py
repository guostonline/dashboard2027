"""Phone number mapping for vendeurs.

Each key is the exact vendeur name as it appears in the data
(dashboard, trends, suivi, etc.). Each value is a WhatsApp-friendly
phone string that can be normalized via `normalize_phone_for_wa()`.
"""

vendeur_number_phone = {
    'E14 BOUMDIANE MOHAMED': "+212 631996727",
    'K91 BAIZ MOHAMED': "+212 626-508898",
    'F78 GHOUSMI MOURAD': "+212 677-529149",
    'E60 BOUALLALI FARID': '+212 659-071044',
    'T89 AKNOUN MOHAMED': '+212 696-362296',
    'D48 IBACH MOHAMED': '+212 654-076929',
    'K60 ELHAOUZI RACHID': '+212 707-744529',
    'D86 ACHAOUI AZIZ': '+212 699-363894',
    'E66 MOUTAOUAKIL MOSTAFA': '+212 671-148846',
    'D45 OUARSSASSA YASSINE': '+212 601-571544',
    'Y60 ATOUAOU AIMAD': '+212 670-524910',
    'F77 EL MEZRAOUI YOUSSEF': '+212 633-314839',
    'Y59 EL GHANMI MOHAMED': '+212 668-399702',
    '485 NAMOUSS ABDESSAMAD': '+212 664-782591',
    'T45 FAICAL GOUIZID': '+212 641-894845',
    'E31 BENCHOUIKH MOHAMMED': '+212 617-976184',
    'E18 BOUBRIK MOHAMED': '+212 613-846847',
    'F82 AKKA ABDESSLAM': '+212669994101',
    'CHAKIB ELFIL': '+212669994101',
}


def normalize_phone_for_wa(phone):
    """Strip spaces / dashes from a phone string so the resulting digits
    can be appended to the `wa.me/` URL.

    Example:
        '+212 631-996727'  -> '212631996727'
    """
    if not phone:
        return ''
    return ''.join(ch for ch in str(phone) if ch.isdigit() or ch == '+').lstrip('+')
