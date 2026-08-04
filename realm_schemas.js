// Realm Object Schemas exported from SQLite database.db

export const focus_vmm_dataSchema = {
  name: 'focus_vmm_data',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'date': 'string',
    'vendeur': 'string',
    'secteur': 'string',
    'dn_fin_mai': 'double?',
    'obj_juin': 'double?',
    'nb_clients': 'int?',
    'obj_acm': 'int?',
    'percent': 'double?',
    'realise': 'double?',
    'rest': 'double?',
    'jour_rest': 'int?',
    'rest_jour': 'double?',
    'created_at': 'string?',
  }
};

export const focus_som_dataSchema = {
  name: 'focus_som_data',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'date': 'string',
    'vendeur': 'string',
    'secteur': 'string',
    'glace_ht': 'double?',
    'ttc': 'double?',
    'percent': 'double?',
    'realise': 'double?',
    'rest': 'double?',
    'rest_jour': 'double?',
    'jour_rest': 'int?',
    'created_at': 'string?',
  }
};

export const settingsSchema = {
  name: 'settings',
  primaryKey: 'date',
  properties: {
    'date': 'string',
    'rest_days': 'int?',
    'exclude_families': 'string?',
    'created_at': 'string?',
  }
};

export const file_metadataSchema = {
  name: 'file_metadata',
  primaryKey: 'date',
  properties: {
    'date': 'string',
    'file_name': 'string?',
    'file_size': 'int?',
    'created_at': 'string?',
    'file_content': 'data?',
  }
};

export const fdvSchema = {
  name: 'fdv',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'vendeur': 'string',
    'activite': 'string',
    'secteur': 'string',
    'telephone': 'string',
    'whatsapp': 'string',
    'recrutement': 'string',
    'notes': 'string',
    'created_at': 'string?',
    'updated_at': 'string?',
    'role': 'string',
    'type_role': 'string',
    'cdz': 'string',
  }
};

export const quantitative_dataSchema = {
  name: 'quantitative_data',
  primaryKey: 'famille',
  properties: {
    'date': 'string',
    'vendeur': 'string',
    'famille': 'string',
    'real': 'int?',
    'obj': 'int?',
    'percent': 'double?',
    'real_2025': 'int?',
    'h_2024': 'int?',
    'h_pct': 'double?',
    'encours': 'int?',
    'obj_mois': 'int?',
    'raf': 'int?',
    'created_at': 'string?',
    'j1': 'int?',
  }
};

export const qualitative_dataSchema = {
  name: 'qualitative_data',
  primaryKey: 'vendeur',
  properties: {
    'date': 'string',
    'vendeur': 'string',
    'clt_programme': 'int?',
    'clt_facture': 'int?',
    'acm': 'double?',
    'tsm': 'double?',
    'line': 'double?',
    'raf_tsm': 'int?',
    'raf_acm': 'int?',
    'created_at': 'string?',
  }
};

export const focus_rankingsSchema = {
  name: 'focus_rankings',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'upload_date': 'string',
    'focus_type': 'string',
    'rank': 'int?',
    'agence': 'string?',
    'secteur': 'string?',
    'representative': 'string?',
    'deviation': 'double?',
    'cdz': 'string?',
  }
};

export const focus_cdz_rankingsSchema = {
  name: 'focus_cdz_rankings',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'upload_date': 'string',
    'focus_type': 'string',
    'rank': 'int?',
    'cdz': 'string?',
    'agence': 'string?',
    'deviation': 'double?',
  }
};

export const focus_objectivesSchema = {
  name: 'focus_objectives',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'focus_type': 'string',
    'vendeur': 'string',
    'secteur': 'string',
    'number_client': 'int?',
    'obj_acm': 'double?',
    'obj_juin': 'double?',
    'glace_ht': 'double?',
    'ttc': 'double?',
  }
};

export const stockSchema = {
  name: 'stock',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'date': 'string',
    'act_code': 'string',
    'site': 'string',
    'soc': 'string',
    'fournisseur': 'string',
    'gamme': 'string',
    'famille': 'string',
    'produit': 'string',
    'designation': 'string',
    'statut': 'string',
    'stk_qte': 'int?',
    'source': 'string',
    'created_at': 'string?',
  }
};

export const stock_favoritesSchema = {
  name: 'stock_favorites',
  primaryKey: 'produit',
  properties: {
    'produit': 'string',
    'created_at': 'string?',
  }
};

export const focus_namesSchema = {
  name: 'focus_names',
  primaryKey: 'focus_type',
  properties: {
    'focus_type': 'string',
    'focus_name': 'string',
  }
};

export const anomaliesSchema = {
  name: 'anomalies',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'date': 'string',
    'vendeur': 'string',
    'type_anomali': 'string',
    'created_at': 'string?',
    'commentaire': 'string?',
    'tag': 'string?',
  }
};

export const tasksSchema = {
  name: 'tasks',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'title': 'string',
    'creator': 'string?',
    'assignee_type': 'string',
    'assignee': 'string',
    'date': 'string',
    'priority': 'string',
    'status': 'string',
    'created_at': 'string?',
  }
};

export const subtasksSchema = {
  name: 'subtasks',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'task_id': 'int',
    'title': 'string',
    'completed': 'int?',
  }
};

export const visites_rapportsSchema = {
  name: 'visites_rapports',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'file_name': 'string?',
    'vendeur': 'string',
    'date_visite': 'string',
    'tournee': 'string?',
    'agence': 'string?',
    'client_code': 'string',
    'client_nom': 'string?',
    'heure': 'string?',
    'distance': 'int?',
    'motif': 'string?',
    'note': 'string?',
    'created_at': 'string?',
  }
};

export const secteursSchema = {
  name: 'secteurs',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'name': 'string',
  }
};

export const localitesSchema = {
  name: 'localites',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'name': 'string',
    'secteur_id': 'int',
  }
};

export const clientsSchema = {
  name: 'clients',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'code': 'string',
    'name': 'string',
    'secteur_id': 'int',
    'localite_id': 'int',
    'vendeur_som': 'string',
    'vendeur_vmm': 'string',
  }
};

export const engagementsSchema = {
  name: 'engagements',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'vendeur': 'string',
    'periode': 'string',
    'date_engagement': 'string',
    'total_dh': 'double?',
    'created_at': 'string?',
  }
};

export const engagement_itemsSchema = {
  name: 'engagement_items',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'engagement_id': 'int',
    'category': 'string',
    'title': 'string',
    'amount_dh': 'double',
  }
};

export const vendeur_tournees_visitsSchema = {
  name: 'vendeur_tournees_visits',
  primaryKey: 'id',
  properties: {
    'id': 'int',
    'vendeur_code': 'string',
    'vendeur_name': 'string?',
    'date': 'string',
    'tournee': 'string?',
    'client_code': 'string',
    'client_name': 'string?',
    'date_visite': 'string?',
    'heure_debut': 'string?',
    'heure_fin': 'string?',
    'duree_minutes': 'double?',
    'motif': 'string?',
    'distance': 'string?',
    'note': 'string?',
    'facture_status': 'string?',
    'created_at': 'string?',
  }
};

