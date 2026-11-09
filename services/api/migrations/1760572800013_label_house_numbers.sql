-- Up Migration
-- House numbers out of location names (D-45). New and edited labels are cleaned by the API
-- (withoutHouseNumber in packages/shared/src/address.ts); this cleans the existing ones with the
-- same rules, part by part between commas. Irreversible by design: the deploy's ZFS snapshot
-- holds the old values.
create function pg_temp.strip_house_number(label text) returns text language plpgsql as $$
declare
  part text;
  cleaned text;
  outp text[] := '{}';
  num constant text := '\d{1,4}\s?[a-zA-Z]?(?:\s*[-–/]\s*\d{1,4}\s?[a-zA-Z]?)?';
  pre constant text := '(?:nº|n\.?º?|no\.?|nr\.?)?';
begin
  foreach part in array regexp_split_to_array(label, ',') loop
    part := btrim(part);
    continue when part = '';
    continue when part ~* ('^' || pre || '\s*' || num || '$');
    if part ~ '^\d{4,5}(?:-\d{3})?\s+[[:alpha:]]' then
      outp := outp || part;
      continue;
    end if;
    cleaned := regexp_replace(part, '\s+' || pre || '\s*' || num || '$', '', 'i');
    cleaned := btrim(regexp_replace(cleaned, '^' || num || '\s+(?=[[:alpha:]])', ''));
    outp := outp || coalesce(nullif(cleaned, ''), part);
  end loop;
  return coalesce(nullif(array_to_string(outp, ', '), ''), btrim(label));
end
$$;

update locations set label = pg_temp.strip_house_number(label) where label ~ '\d';

-- Down Migration
-- Nothing to undo: the removed numbers are not kept (restore the pre-deploy snapshot if needed).
