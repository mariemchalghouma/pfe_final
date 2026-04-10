import pool from "../config/database.js";

const normalizeOptionalText = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeRolesValue = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

export const getUsers = async () => {
  try {
    const result = await pool.query(`
      SELECT id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    return Response.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error in getUsers:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des utilisateurs",
      },
      { status: 500 },
    );
  }
};

export const getUserById = async (id) => {
  try {
    const result = await pool.query(
      "SELECT id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at FROM users WHERE id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return Response.json(
        { success: false, message: "Utilisateur non trouvé" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error in getUserById:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération de l'utilisateur",
      },
      { status: 500 },
    );
  }
};

export const createUser = async (req) => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      identifiant,
      phone,
      roles,
      status,
    } = await req.json();

    const normalizedEmail = normalizeOptionalText(email);
    const normalizedPhone = normalizeOptionalText(phone);
    const normalizedIdentifiant = normalizeOptionalText(identifiant);
    const normalizedFirstName = normalizeOptionalText(first_name) || "";
    const normalizedLastName = normalizeOptionalText(last_name) || "";

    if (!normalizedIdentifiant) {
      return Response.json(
        { success: false, message: "Identifiant requis" },
        { status: 400 },
      );
    }

    // Check if user already exists (only if email is provided)
    if (normalizedEmail) {
      const checkUser = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
        [normalizedEmail],
      );
      if (checkUser.rows.length > 0) {
        return Response.json(
          { success: false, message: "Cet email est déjà utilisé" },
          { status: 400 },
        );
      }
    }

    const checkIdentifiant = await pool.query(
      "SELECT id FROM users WHERE LOWER(identifiant) = LOWER($1)",
      [normalizedIdentifiant],
    );
    if (checkIdentifiant.rows.length > 0) {
      return Response.json(
        { success: false, message: "Cet identifiant est déjà utilisé" },
        { status: 400 },
      );
    }

    const name = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const result = await pool.query(
      `INSERT INTO users (email, password, name, first_name, last_name, identifiant, phone, roles, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at`,
      [
        normalizedEmail,
        password,
        name,
        normalizedFirstName,
        normalizedLastName,
        normalizedIdentifiant,
        normalizedPhone,
        JSON.stringify(roles || []),
        status || "Actif",
      ],
    );

    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error in createUser:", error);

    if (error?.code === "23505") {
      if (error?.constraint === "users_email_key") {
        return Response.json(
          { success: false, message: "Cet email est déjà utilisé" },
          { status: 400 },
        );
      }

      if (error?.constraint === "users_identifiant_key") {
        return Response.json(
          { success: false, message: "Cet identifiant est déjà utilisé" },
          { status: 400 },
        );
      }

      return Response.json(
        { success: false, message: "Valeur déjà utilisée (unicité)" },
        { status: 400 },
      );
    }

    return Response.json(
      {
        success: false,
        message: "Erreur lors de la création de l'utilisateur",
      },
      { status: 500 },
    );
  }
};

export const updateUser = async (id, req) => {
  try {
    const payload = await req.json();
    const {
      email,
      first_name,
      last_name,
      identifiant,
      phone,
      roles,
      status,
      password,
    } = payload;

    const existingUserResult = await pool.query(
      "SELECT id, email, name, first_name, last_name, identifiant, phone, roles, status FROM users WHERE id = $1",
      [id],
    );

    if (existingUserResult.rows.length === 0) {
      return Response.json(
        { success: false, message: "Utilisateur non trouvé" },
        { status: 404 },
      );
    }

    const existingUser = existingUserResult.rows[0];
    const hasField = (fieldName) =>
      Object.prototype.hasOwnProperty.call(payload, fieldName);

    const normalizedEmail = hasField("email")
      ? normalizeOptionalText(email)
      : existingUser.email;
    const normalizedPhone = hasField("phone")
      ? normalizeOptionalText(phone)
      : existingUser.phone;
    const normalizedIdentifiant = hasField("identifiant")
      ? normalizeOptionalText(identifiant)
      : existingUser.identifiant;
    const normalizedFirstName = hasField("first_name")
      ? normalizeOptionalText(first_name) || ""
      : existingUser.first_name || "";
    const normalizedLastName = hasField("last_name")
      ? normalizeOptionalText(last_name) || ""
      : existingUser.last_name || "";
    const statusToSave = hasField("status")
      ? normalizeOptionalText(status) || existingUser.status || "Actif"
      : existingUser.status || "Actif";
    const rolesToSave = hasField("roles")
      ? normalizeRolesValue(roles)
      : normalizeRolesValue(existingUser.roles);
    const normalizedPassword = normalizeOptionalText(password);

    if (!normalizedIdentifiant) {
      return Response.json(
        { success: false, message: "Identifiant requis" },
        { status: 400 },
      );
    }

    if (normalizedEmail) {
      const checkEmail = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2",
        [normalizedEmail, id],
      );

      if (checkEmail.rows.length > 0) {
        return Response.json(
          { success: false, message: "Cet email est déjà utilisé" },
          { status: 400 },
        );
      }
    }

    const checkIdentifiant = await pool.query(
      "SELECT id FROM users WHERE LOWER(identifiant) = LOWER($1) AND id <> $2",
      [normalizedIdentifiant, id],
    );

    if (checkIdentifiant.rows.length > 0) {
      return Response.json(
        { success: false, message: "Cet identifiant est déjà utilisé" },
        { status: 400 },
      );
    }

    const name =
      `${normalizedFirstName} ${normalizedLastName}`.trim() ||
      existingUser.name ||
      normalizedIdentifiant;

    let query = `
      UPDATE users 
      SET email = $1, name = $2, first_name = $3, last_name = $4, identifiant = $5, phone = $6, roles = $7, status = $8
    `;
    let params = [
      normalizedEmail,
      name,
      normalizedFirstName,
      normalizedLastName,
      normalizedIdentifiant,
      normalizedPhone,
      JSON.stringify(rolesToSave),
      statusToSave,
      id,
    ];

    if (normalizedPassword) {
      query += `, password = $${params.length}`;
      params.splice(params.length - 1, 0, normalizedPassword);
    }

    query += ` WHERE id = $${params.length} RETURNING id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at`;

    const result = await pool.query(query, params);

    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error in updateUser:", error);

    if (error?.code === "23505") {
      if (error?.constraint === "users_email_key") {
        return Response.json(
          { success: false, message: "Cet email est déjà utilisé" },
          { status: 400 },
        );
      }

      if (error?.constraint === "users_identifiant_key") {
        return Response.json(
          { success: false, message: "Cet identifiant est déjà utilisé" },
          { status: 400 },
        );
      }

      return Response.json(
        { success: false, message: "Valeur déjà utilisée (unicité)" },
        { status: 400 },
      );
    }

    return Response.json(
      {
        success: false,
        message: "Erreur lors de la mise à jour de l'utilisateur",
      },
      { status: 500 },
    );
  }
};

export const deleteUser = async (id) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return Response.json(
        { success: false, message: "Utilisateur non trouvé" },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      message: "Utilisateur supprimé avec succès",
    });
  } catch (error) {
    console.error("Error in deleteUser:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la suppression de l'utilisateur",
      },
      { status: 500 },
    );
  }
};
